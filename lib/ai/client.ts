import type { ChatOptions } from "@/types/model";
import { logger } from "@/lib/utils/logger";

/**
 * ============================================================
 *  AI PROVIDER ABSTRACTION
 * ------------------------------------------------------------
 *  Frontend and API routes talk ONLY to this interface.
 *  Swap providers without touching the UI.
 * ============================================================
 */
export interface AIProvider {
  readonly id: string;
  chat(options: ChatOptions): Promise<string>;
  streamChat(options: ChatOptions): Promise<ReadableStream<Uint8Array>>;
  generateImage(prompt: string): Promise<string>; // returns data URI or URL
}

/* ------------------------------------------------------------
 * OpenRouter Provider
 * ---------------------------------------------------------- */
class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter";

  constructor(private apiKeys: string[], private defaultModel: string) {}

  private endpoint() {
    return `https://openrouter.ai/api/v1/chat/completions`;
  }

  private async tryFetch(key: string, body: any, stream = false) {
    try {
      const res = await fetch(this.endpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ ...body, stream }),
      });
      return res;
    } catch (err) {
      return null;
    }
  }

  async chat(options: ChatOptions): Promise<string> {
    const model = options.model || this.defaultModel;
    const body = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: false,
    };

    for (const key of this.apiKeys) {
      const res = await this.tryFetch(key, body, false);
      if (!res) continue;
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      return data?.choices?.[0]?.message?.content ?? "";
    }
    throw new Error("OpenRouter: all keys failed or network error");
  }

  async streamChat(options: ChatOptions): Promise<ReadableStream<Uint8Array>> {
    const model = options.model || this.defaultModel;
    const body = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };

    for (const key of this.apiKeys) {
      const res = await this.tryFetch(key, body, true);
      if (!res || !res.ok || !res.body) continue;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";

      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed.startsWith("data:")) {
                const payload = trimmed.slice(5).trim();
                if (payload === "[DONE]") continue;
                try {
                  const json = JSON.parse(payload) as any;
                  const token = json?.choices?.[0]?.delta?.content;
                  if (token) controller.enqueue(encoder.encode(token));
                } catch {
                  // partial JSON — wait for next chunk
                }
              }
            }
          } catch (e) {
            controller.close();
          }
        },
        async cancel() {
          await reader.cancel().catch(() => undefined);
        },
      });
    }

    throw new Error("OpenRouter: all keys failed or no stream available");
  }

  async generateImage(prompt: string): Promise<string> {
    const imageBase = process.env.IMAGE_BASE_URL || "https://openrouter.ai";
    const key = this.apiKeys[0];
    if (!key) throw new Error("OpenRouter image provider is not configured");
    const imageModel = process.env.IMAGE_MODEL || "dall-e-3";
    try {
      const res = await fetch(`${imageBase.replace(/\/+$/, "")}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model: imageModel, prompt, n: 1, size: "1024x1024" }),
      });
      if (!res.ok) throw new Error(`Image provider responded ${res.status}`);
      const data = await res.json().catch(() => null) as any;
      const first = data?.data?.[0];
      if (first?.url) return first.url;
      if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
      throw new Error("OpenRouter image provider returned no image");
    } catch (e) {
      throw e;
    }
  }
}

/* ------------------------------------------------------------
 * Factory
 * ---------------------------------------------------------- */
let cached: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (cached) return cached;

  // Prefer OpenRouter if OPENROUTER_API_KEYS/OPENROUTER_API_KEY is set
  const orKeys = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);
  if (orKeys.length > 0) {
    const model = process.env.OPENROUTER_MODEL || "gemma-4-31b-it";
    logger.info("ai", `provider=openrouter model=${model}`);
    cached = new OpenRouterProvider(orKeys, model);
    return cached;
  }

  throw new Error("OpenRouter is not configured. Set OPENROUTER_API_KEY or OPENROUTER_API_KEYS.");
}

/** True when a real AI provider is configured. */
export function isRealProvider(): boolean {
  // Treat OpenRouter env as a real provider too
  const or = Boolean(process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY);
  return or;
}

/* ------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------- */
function truncate(s: string, max = 140): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

/**
 * Procedural placeholder image (pure SVG data URI, zero network).
 * Used for deterministic local image generation when explicitly requested.
 */
export function proceduralImage(prompt: string): string {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }
  const h1 = hash % 360;
  const h2 = (h1 + 140) % 360;
  const label = truncate(prompt, 48).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${h1},70%,8%)"/><stop offset="1" stop-color="hsl(${h2},80%,14%)"/>` +
    `</linearGradient><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">` +
    `<path d="M48 0H0V48" fill="none" stroke="hsl(${h1},60%,30%)" stroke-opacity="0.35"/></pattern></defs>` +
    `<rect width="1024" height="1024" fill="url(#g)"/><rect width="1024" height="1024" fill="url(#grid)"/>` +
    `<circle cx="${200 + (hash % 600)}" cy="${180 + ((hash >> 8) % 500)}" r="${120 + (hash % 160)}" ` +
    `fill="hsl(${h2},90%,55%)" fill-opacity="0.18"/>` +
    `<rect x="60" y="880" width="904" height="84" fill="#050505" fill-opacity="0.72" stroke="hsl(${h1},80%,50%)" stroke-opacity="0.5"/>` +
    `<text x="84" y="920" font-family="monospace" font-size="22" fill="hsl(${h1},90%,65%)">K3 IMAGE SYNTHESIS // LOCAL OUTPUT</text>` +
    `<text x="84" y="948" font-family="monospace" font-size="18" fill="#8fa895">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
