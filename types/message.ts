export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  createdAt: number;
  model?: string;
  attachments?: AttachmentMeta[];
  error?: boolean;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
  mime: string;
}

export interface SendMessagePayload {
  conversationId: string;
  content: string;
  model: string;
  memoryEnabled: boolean;
  responseStyle: ResponseStyle;
  attachments?: AttachmentMeta[];
}

export type ResponseStyle = "concise" | "balanced" | "detailed";
