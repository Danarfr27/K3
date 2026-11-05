// ------------------------------------------------------------
  // OpenAI API configuration
  // ------------------------------------------------------------

  const keysString =
    process.env.OPENAI_API_KEYS ||
    process.env.OPENAI_API_KEY ||
    "";

  const apiKeys = keysString
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  const OPENAI_MODEL =
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";

  if (apiKeys.length > 0) {
    let messagesForProvider: ProviderMessage[] = [];

    if (isWormgemmaRequest) {
      messagesForProvider = normalizeContents(body.contents);
    } else {
      const history = getMessages(conversationId!);

      const contextMessages = buildContext({
        history,
        responseStyle,
      });

      messagesForProvider = contextMessages
        .slice(-LIMITS.MAX_MESSAGES_PER_REQUEST)
        .map((message) => ({
          role:
            message.role === "system" ||
            message.role === "user" ||
            message.role === "assistant"
              ? message.role
              : "user",
          content: message.content,
        }));

      // Set user prompt terbaru jika ada lampiran berkas
      if (
        enriched !== undefined &&
        enriched !== content &&
        messagesForProvider.length > 0
      ) {
        for (let i = messagesForProvider.length - 1; i >= 0; i--) {
          if (messagesForProvider[i].role === "user") {
            messagesForProvider[i].content = enriched;
            break;
          }
        }
      }
    }

    // Sisipkan PERSONA dari environment variable ke posisi paling atas
    messagesForProvider = applyPersona(messagesForProvider);

    // Iterasi rotasi API Key jika salah satu key kena rate-limit atau kehabisan kuota
    for (let attempt = 0; attempt < apiKeys.length; attempt++) {
      const apiKey = apiKeys[attempt];

      try {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: OPENAI_MODEL,
              messages: messagesForProvider,
              stream: true,
              temperature: 0.7,
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          logger.warn(
            "chat",
            `OpenAI attempt ${attempt + 1}/${apiKeys.length} failed [${response.status}]: ${errText}`
          );

          if (
            (response.status === 429 ||
              response.status === 401 ||
              response.status === 403) &&
            attempt < apiKeys.length - 1
          ) {
            continue;
          }
          break;
        }

        if (!response.body) {
          throw new Error("OpenAI response body is null");
        }

        // ------------------------------------------------------------
        // Streaming Pipeline Setup (OpenAI SSE)
        // ------------------------------------------------------------
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let fullAssistantContent = "";

        const stream = new ReadableStream({
          async start(controller) {
            const reader = response.body!.getReader();
            let buffer = "";

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed.startsWith(":")) continue;

                  if (trimmed === "data: [DONE]") {
                    continue;
                  }

                  if (trimmed.startsWith("data: ")) {
                    try {
                      const json = JSON.parse(trimmed.slice(6));
                      const delta = json?.choices?.[0]?.delta?.content || "";

                      if (delta) {
                        const cleanDelta = repairRepeatedTokens(
                          fullAssistantContent,
                          delta
                        );
                        fullAssistantContent = appendStreamText(
                          fullAssistantContent,
                          cleanDelta
                        );
                        controller.enqueue(encoder.encode(cleanDelta));
                      }
                    } catch (e) {
                      // Abaikan chunk JSON SSE yang tidak valid
                    }
                  }
                }
              }

              // Selesaikan sisa buffer jika ada
              if (buffer.trim() && buffer.trim().startsWith("data: ")) {
                try {
                  const json = JSON.parse(buffer.trim().slice(6));
                  const delta = json?.choices?.[0]?.delta?.content || "";
                  if (delta) {
                    const cleanDelta = repairRepeatedTokens(
                      fullAssistantContent,
                      delta
                    );
                    fullAssistantContent = appendStreamText(
                      fullAssistantContent,
                      cleanDelta
                    );
                    controller.enqueue(encoder.encode(cleanDelta));
                  }
                } catch {
                  // ignore
                }
              }
            } catch (err) {
              logger.error(
                "chat",
                `Stream reading error: ${
                  err instanceof Error ? err.message : String(err)
                }`
              );
              controller.error(err);
            } finally {
              reader.releaseLock();

              // Simpan balasan utuh ke percakapan lokal/database
              if (fullAssistantContent.trim()) {
                const assistantMessage = makeMessage({
                  conversationId: conversationId!,
                  role: "assistant",
                  content: fullAssistantContent,
                  model: OPENAI_MODEL,
                });

                appendMessage(assistantMessage);
                touchConversation(clientId, conversationId!, {
                  preview: fullAssistantContent.slice(0, 100),
                  deltaMessages: 2,
                  title: isNewConversation
                    ? titleFromFirstMessage(content)
                    : undefined,
                });
              }

              controller.close();
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Conversation-Id": conversationId!,
            "X-User-Message-Id": userMessage?.id ?? "",
            "X-Provider": "openai",
            "X-Model": OPENAI_MODEL,
          },
        });
      } catch (error) {
        logger.error(
          "chat",
          `OpenAI attempt ${attempt + 1} exception: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        if (attempt === apiKeys.length - 1) {
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------
  // Fallback Provider (Internal / Local Provider)
  // ------------------------------------------------------------
  const provider = getProvider();

  if (provider) {
    try {
      const messagesForFallback = applyPersona(
        messagesForProvider.length > 0
          ? messagesForProvider
          : [{ role: "user", content: enriched || content }]
      );

      const stream = await provider.chatStream({
        model,
        messages: messagesForFallback,
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Conversation-Id": conversationId!,
          "X-User-Message-Id": userMessage?.id ?? "",
          "X-Provider": "local-provider",
        },
      });
    } catch (fallbackError) {
      logger.error(
        "chat",
        `Fallback provider failed: ${
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
        }`
      );
    }
  }

  return NextResponse.json(
    { error: "PROVIDER_ERROR", message: "Gagal terhubung ke layanan AI." },
    { status: 502 }
  );
}
