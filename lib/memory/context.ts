import type { ChatRequestMessage } from "@/types/model";
import type { ChatMessage, ResponseStyle } from "@/types/message";
import { buildSystemPrompt } from "@/lib/ai/prompts";

/**
 * Context builder — assembles what actually gets sent to the model.
 *
 * Strategy (never dump the whole history blindly):
 *   system prompt (style + memory notes)
 * + rolling window of the most recent messages
 * + hard character budget as a cheap token proxy
 */

const RECENT_WINDOW = 12;
const CHAR_BUDGET = 12_000; // ≈ 3–4k tokens, safe for most providers

export function buildContext(options: {
  history: ChatMessage[];
  responseStyle: ResponseStyle;
}): ChatRequestMessage[] {
  const { history, responseStyle } = options;

  const system = buildSystemPrompt(responseStyle, []);

  // Rolling window, oldest → newest.
  const windowed = history.slice(-RECENT_WINDOW);

  const out: ChatRequestMessage[] = [{ role: "system", content: system }];
  let budget = CHAR_BUDGET - system.length;

  // Walk newest-first, keep what fits, then re-order.
  const kept: ChatRequestMessage[] = [];
  for (let i = windowed.length - 1; i >= 0; i--) {
    const msg = windowed[i];
    if (msg.role === "system") continue;
    const content = msg.content;
    if (content.length > budget && kept.length > 0) break;
    budget -= content.length;
    kept.unshift({ role: msg.role, content });
  }

  return out.concat(kept);
}
