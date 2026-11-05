
  // ------------------------------------------------------------
  // Sumopod AI configuration (OpenAI-compatible API)
  // ------------------------------------------------------------

  const SUMOPOD_BASE_URL = (
    process.env.OPENAI_BASE_URL || "https://ai.sumopod.com/v1/"
  ).replace(/\/+$/, "");

  const SUMOPOD_API_KEY = process.env.OPENAI_API_KEY || "";

  const SUMOPOD_MODEL =
    process.env.OPENAI_MODEL || "gemini/gemini-3.5-flash-lite";

  if (SUMOPOD_API_KEY) {
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

      if (
        enriched !== undefined &&
        enriched !== content &&
        messagesForProvider.length > 0
      ) {
        for (let i = messagesForProvider.length - 1; i >= 0; i--) {
          if (messagesForProvider[i].role === "user") {
            messagesForProvider[i] = {
              role: "user",
              content: enriched,
            };
            break;
          }
        }
      }
    }

    messagesForProvider = applyPersona(messagesForProvider);

    if (messagesForProvider.length === 0) {
      return NextResponse.json(
        { error: "EMPTY_CONTEXT" },
        { status: 400 }
      );
    }

    try {
      const response = await fetch(
        `${SUMOPOD_BASE_URL}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUMOPOD_API_KEY}`,
            "Content-Type": "application/json",
            "X-Title": process.env.SITE_TITLE || "FIRDHAN AI",
          },
          body: JSON.stringify({
            model: SUMOPOD_MODEL,
            stream: true,
            messages: messagesForProvider,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);

        return NextResponse.json(
          {
            error: "SUMOPOD_REQUEST_FAILED",
            message:
              errorData?.error?.message ||
              `Sumopod API returned HTTP ${response.status}`,
          },
          { status: response.status }
        );
      }

      if (!response.body) {
        return NextResponse.json(
          { error: "SUMOPOD_EMPTY_RESPONSE" },
          { status: 502 }
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let buffer = "";
          let fullContent = "";

          const processLine = (line: string) => {
            const trimmed = line.trim();

            if (!trimmed.startsWith("data:")) return;

            const data = trimmed.slice(5).trim();

            if (!data || data === "[DONE]") return;

            try {
              const json = JSON.parse(data);
              const chunk = json?.choices?.[0]?.delta?.content;

              if (typeof chunk === "string" && chunk) {
                const next = appendStreamText(fullContent, chunk);
                const emitted = next.slice(fullContent.length);

                fullContent = next;

                if (emitted) {
                  controller.enqueue(encoder.encode(emitted));
                }
              }
            } catch {
              // Ignore incomplete SSE events.
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() || "";

              lines.forEach(processLine);
            }

            buffer += decoder.decode();

            if (buffer.trim()) {
              processLine(buffer);
            }
          } catch (error) {
            logger.error("chat", "Sumopod stream failed", error);
            controller.enqueue(
              encoder.encode("\n\n[CONNECTION INTERRUPTED]")
            );
          } finally {
            const cleanContent = repairRepeatedTokens(fullContent);

            if (conversationId && cleanContent.trim()) {
              const assistantMessage = makeMessage({
                conversationId,
                role: "assistant",
                content: cleanContent,
                model: SUMOPOD_MODEL,
              });

              appendMessage(assistantMessage);

              touchConversation(clientId, conversationId, {
                preview: cleanContent.slice(0, 120),
                deltaMessages: 2,
                title: isNewConversation
                  ? titleFromFirstMessage(content)
                  : undefined,
              });
            }

            controller.close();
          }
        },

        async cancel() {
          await reader.cancel().catch(() => undefined);
        },
      });

      const headers = new Headers({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "X-Provider": "sumopod",
      });

      if (conversationId) {
        headers.set("X-Conversation-Id", conversationId);
      }

      if (userMessage?.id) {
        headers.set("X-User-Message-Id", userMessage.id);
      }

      return new Response(stream, {
        status: 200,
        headers,
      });
    } catch (error) {
      logger.error("chat", "Sumopod request failed", error);

      return NextResponse.json(
        {
          error: "SUMOPOD_CONNECTION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Unable to connect to Sumopod API",
        },
        { status: 502 }
      );
    }
  }
