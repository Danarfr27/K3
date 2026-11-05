import { NextRequest, NextResponse } from "next/server";
import { getProvider, isRealProvider } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/models";
import { buildContext } from "@/lib/memory/context";
import {
  createConversation,
  getConversation,
  touchConversation,
  titleFromFirstMessage,
} from "@/lib/chat/conversations";
import { appendMessage, getMessages, makeMessage } from "@/lib/chat/messages";
import { checkRateLimit, clientKey } from "@/lib/utils/ratelimit";
import { isNonEmptyString, isValidId, LIMITS } from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";
import { appendStreamText, repairRepeatedTokens } from "@/lib/chat/text";
import type { ResponseStyle } from "@/types/message";
import type { ChatRequestMessage } from "@/types/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERSONA = (process.env.PERSONA || "").trim();
const HELP_TEXT = [
  "FIRDHAN OSINT COMMANDS",
  "",
  "/help -> tampilkan daftar command yang tersedia",
  "/whois \"nama\" -> pencarian informasi publik",
  "/osint \"nama\" -> pencarian profil sosial publik",
  "/social \"nama\" -> alias dari /osint",
  "/email \"nama\" -> pencarian informasi publik terkait email",
  "/company \"nama\" -> pencarian profil perusahaan",
  "/phone \"nama\" -> pencarian informasi publik terkait telepon",
  "/domain \"nama\" -> pencarian informasi domain",
].join("\n");

type IncomingMessage = ChatRequestMessage;

function getClientId(req: NextRequest): string {
  const header = req.headers.get("x-k3-client");
  return header && isValidId(header) ? header : "anonymous";
}

function normalizeContents(contents: unknown): IncomingMessage[] {
  if (!Array.isArray(contents)) return [];
  return contents.flatMap((item: any): IncomingMessage[] => {
    const role = item?.role === "model" ? "assistant" : item?.role;
    if (role !== "user" && role !== "assistant" && role !== "system") return [];

    const content = Array.isArray(item?.parts)
      ? item.parts.map((part: any) => typeof part?.text === "string" ? part.text : "").join("\n")
      : typeof item?.content === "string" ? item.content : "";
    return content.trim() ? [{ role, content: content.slice(0, LIMITS.MAX_MESSAGE_CHARS) }] : [];
  });
}

function addPersona(messages: IncomingMessage[]): IncomingMessage[] {
  return PERSONA ? [{ role: "system", content: PERSONA }, ...messages] : messages;
}

function responseHeaders(conversationId: string, userMessageId: string, provider: string) {
  return {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Conversation-Id": conversationId,
    "X-User-Message-Id": userMessageId,
    "X-Provider": provider,
  };
}

export async function GET() {
  return NextResponse.json({
    models: MODELS,
    provider: isRealProvider() ? "configured" : "unconfigured",
    memory: [],
    personaConfigured: Boolean(PERSONA),
  });
}

export async function DELETE() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rateLimit = checkRateLimit(`chat:${clientKey(req)}`, 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterSec: rateLimit.retryAfterSec },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const isContentsRequest = Array.isArray(body?.contents);
  const incoming = isContentsRequest
    ? normalizeContents(body.contents)
    : isNonEmptyString(body?.content)
      ? [{ role: "user" as const, content: body.content.slice(0, LIMITS.MAX_MESSAGE_CHARS) }]
      : [];
  const lastUserMessage = [...incoming].reverse().find((message) => message.role === "user");
  const content = lastUserMessage?.content || "";
  if (!content.trim()) {
    return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
  }

  const responseStyle: ResponseStyle =
    body.responseStyle === "concise" || body.responseStyle === "detailed"
      ? body.responseStyle
      : "balanced";
  const requestedId = body.conversationId;
  const existing = requestedId && isValidId(requestedId)
    ? getConversation(clientId, requestedId)
    : null;
  const conversation = existing
    ? { id: requestedId as string, isNew: false }
    : {
        id: createConversation(clientId, titleFromFirstMessage(content)).id,
        isNew: true,
      };

  const userMessage = makeMessage({
    conversationId: conversation.id,
    role: "user",
    content,
  });
  appendMessage(userMessage);

  if (/^\/(help|menu|commands)\s*$/i.test(content.trim())) {
    const reply = makeMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: HELP_TEXT,
      model: "help-command",
    });
    appendMessage(reply);
    touchConversation(clientId, conversation.id, {
      preview: "HELP COMMANDS",
      deltaMessages: 2,
      title: conversation.isNew ? titleFromFirstMessage(content) : undefined,
    });
    return new Response(HELP_TEXT, {
      headers: responseHeaders(conversation.id, userMessage.id, "help-command"),
    });
  }

  let messages: IncomingMessage[];
  if (isContentsRequest) {
    messages = incoming;
  } else {
    try {
      messages = buildContext({ history: getMessages(conversation.id), responseStyle })
        .slice(-LIMITS.MAX_MESSAGES_PER_REQUEST)
        .map((message) => ({
          role: message.role === "system" || message.role === "assistant" ? message.role : "user",
          content: message.content,
        }));
    } catch (error) {
      logger.error("chat", `Failed to build conversation context: ${error instanceof Error ? error.message : String(error)}`);
      messages = [{ role: "user", content }];
    }
  }
  messages = addPersona(messages);

  const keys = (process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const openAiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

  for (let attempt = 0; attempt < keys.length; attempt++) {
    let upstream: Response;
    try {
      upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keys[attempt]}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: openAiModel, messages, stream: true, temperature: 0.7 }),
      });
    } catch (error) {
      logger.warn("chat", `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      logger.warn("chat", `OpenAI request failed [${upstream.status}]: ${detail.slice(0, 1000)}`);
      // Retry a different key only for authentication, rate-limit, and server errors.
      if ([401, 403, 429].includes(upstream.status) || upstream.status >= 500) continue;
      break;
    }
    if (!upstream.body) {
      logger.warn("chat", "OpenAI response body is empty");
      continue;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let assistantContent = "";
    let buffer = "";
    let saved = false;

    const saveAssistantMessage = () => {
      if (saved || !assistantContent.trim()) return;
      saved = true;
      appendMessage(makeMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: assistantContent,
        model: openAiModel,
      }));
      touchConversation(clientId, conversation.id, {
        preview: assistantContent.slice(0, 100),
        deltaMessages: 2,
        title: conversation.isNew ? titleFromFirstMessage(content) : undefined,
      });
    };

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              buffer += decoder.decode();
              const remaining = buffer.split("\n");
              for (const line of remaining) {
                const delta = parseDelta(line);
                if (delta) {
                  assistantContent = appendStreamText(assistantContent, delta);
                  controller.enqueue(encoder.encode(delta));
                }
              }
              saveAssistantMessage();
              controller.close();
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const delta = parseDelta(line);
              if (!delta) continue;
              assistantContent = appendStreamText(assistantContent, delta);
              controller.enqueue(encoder.encode(delta));
            }
            if (lines.length > 0) return;
          }
        } catch (error) {
          logger.error("chat", `OpenAI stream failed: ${error instanceof Error ? error.message : String(error)}`);
          await reader.cancel().catch(() => undefined);
          try {
            saveAssistantMessage();
            controller.error(error);
          } catch (saveError) {
            logger.error("chat", `Failed to save partial response: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
            controller.error(error);
          }
        }
      },
      async cancel() {
        await reader.cancel().catch(() => undefined);
      },
    });

    return new Response(stream, {
      headers: {
        ...responseHeaders(conversation.id, userMessage.id, "openai"),
        "X-Model": openAiModel,
      },
    });
  }

  try {
    const provider = getProvider();
    const model = isNonEmptyString(body.model, 64) ? body.model : MODELS[0]?.id || "default";
    const upstreamStream = await provider.streamChat({ model, messages });
    const reader = upstreamStream.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let assistantContent = "";
    let saved = false;

    const saveAssistantMessage = () => {
      if (saved || !assistantContent.trim()) return;
      saved = true;
      appendMessage(makeMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: assistantContent,
        model,
      }));
      touchConversation(clientId, conversation.id, {
        preview: assistantContent.slice(0, 100),
        deltaMessages: 2,
        title: conversation.isNew ? titleFromFirstMessage(content) : undefined,
      });
    };

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            saveAssistantMessage();
            controller.close();
            return;
          }
          const chunk = decoder.decode(value, { stream: true });
          assistantContent = appendStreamText(assistantContent, chunk);
          controller.enqueue(encoder.encode(chunk));
        } catch (error) {
          logger.error("chat", `Fallback stream failed: ${error instanceof Error ? error.message : String(error)}`);
          await reader.cancel().catch(() => undefined);
          saveAssistantMessage();
          controller.error(error);
        }
      },
      async cancel() {
        await reader.cancel().catch(() => undefined);
      },
    });

    return new Response(stream, {
      headers: responseHeaders(conversation.id, userMessage.id, provider.id),
    });
  } catch (error) {
    logger.error("chat", `No AI provider available: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: "PROVIDER_ERROR", message: "Gagal terhubung ke layanan AI. Periksa konfigurasi API key." },
      { status: 502 }
    );
  }
}

function parseDelta(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:") || trimmed === "data: [DONE]") return "";
  try {
    const payload = JSON.parse(trimmed.slice(5).trim());
    const content = payload?.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}
