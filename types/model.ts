export interface AIModel {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  provider: string;
}

export interface ChatRequestMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatRequestMessage[];
  temperature?: number;
  maxTokens?: number;
}
