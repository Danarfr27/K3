import type { ChatMessage } from "@/types/message";

/**
 * Message store — in-memory, keyed by conversation.
 * Abstraction boundary: replace with a database adapter
 * (Vercel KV / Postgres / Upstash) without touching callers.
 */

const messagesByConversation = new Map<string, ChatMessage[]>();

const MAX_MESSAGES_PER_CONVERSATION = 200;

export function getMessages(conversationId: string): ChatMessage[] {
  return messagesByConversation.get(conversationId) ?? [];
}

export function appendMessage(message: ChatMessage): ChatMessage {
  const list = messagesByConversation.get(message.conversationId) ?? [];
  list.push(message);
  messagesByConversation.set(
    message.conversationId,
    list.slice(-MAX_MESSAGES_PER_CONVERSATION)
  );
  return message;
}

export function replaceMessage(conversationId: string, messageId: string, next: Partial<ChatMessage>): void {
  const list = messagesByConversation.get(conversationId);
  if (!list) return;
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
}

export function deleteMessages(conversationId: string): void {
  messagesByConversation.delete(conversationId);
}

export function makeMessage(partial: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
  return {
    ...partial,
    id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
  };
}
