export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview?: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: import("./message").ChatMessage[];
}
