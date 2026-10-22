import { getProvider } from "@/lib/ai/client";
import { LIMITS } from "@/lib/utils/validation";

/**
 * Image generation — thin wrapper over the active AI provider.
 * The route handler stays dumb; all provider logic lives here.
 */
export async function generateImage(prompt: string): Promise<{ url: string; model: string }> {
  const provider = getProvider();
  const url = await provider.generateImage(prompt.slice(0, LIMITS.MAX_IMAGE_PROMPT_CHARS));
  return { url, model: process.env.IMAGE_MODEL || `${provider.id}-image` };
}
