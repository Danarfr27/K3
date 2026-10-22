import type { AIModel } from "@/types/model";

/**
 * Model registry.
 *
 * Add or remove models here — the UI reads this list through
 * GET /api/chat (models endpoint) and never hardcodes providers.
 */
export const MODELS: AIModel[] = [
  {
    id: "worm-gpt",
    name: "WORM-GPT",
    description: "Default cyber-intelligence model. Balanced speed and depth.",
    contextWindow: 32_000,
    provider: "k3",
  },
  {
    id: "k3-turbo",
    name: "K3-TURBO",
    description: "Fastest responses. Optimized for quick Q&A.",
    contextWindow: 16_000,
    provider: "k3",
  },
  {
    id: "k3-deep",
    name: "K3-DEEP",
    description: "Deeper reasoning for analysis, code and research.",
    contextWindow: 64_000,
    provider: "k3",
  },
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

export function getModel(id: string): AIModel {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}
