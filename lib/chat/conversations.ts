import type { Conversation, ConversationWithMessages } from "@/types/conversation";
import { sanitizeTitle } from "@/lib/utils/validation";
import { getMessages, deleteMessages } from "./messages";

/**
 * Conversation store — in-memory per server instance.
 * Same swap-to-database contract as the message store.
 */

const conversationsByClient = new Map<string, Conversation[]>();

const MAX_CONVERSATIONS_PER_CLIENT = 60;

export function listConversations(clientId: string): Conversation[] {
  return [...(conversationsByClient.get(clientId) ?? [])].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
}

export function getConversation(
  clientId: string,
  conversationId: string
): ConversationWithMessages | null {
  const convo = (conversationsByClient.get(clientId) ?? []).find(
    (c) => c.id === conversationId
  );
  if (!convo) return null;
  return { ...convo, messages: getMessages(conversationId) };
}

export function createConversation(clientId: string, title = "New session"): Conversation {
  const now = Date.now();
  const convo: Conversation = {
    id: `cnv_${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
    title: sanitizeTitle(title),
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
  const list = conversationsByClient.get(clientId) ?? [];
  list.push(convo);
  conversationsByClient.set(clientId, list.slice(-MAX_CONVERSATIONS_PER_CLIENT));
  return convo;
}

export function touchConversation(
  clientId: string,
  conversationId: string,
  patch?: { title?: string; preview?: string; deltaMessages?: number }
): void {
  const list = conversationsByClient.get(clientId);
  if (!list) return;
  const convo = list.find((c) => c.id === conversationId);
  if (!convo) return;
  convo.updatedAt = Date.now();
  if (patch?.title) convo.title = sanitizeTitle(patch.title);
  if (patch?.preview !== undefined) convo.preview = patch.preview.slice(0, 120);
  if (patch?.deltaMessages) convo.messageCount += patch.deltaMessages;
}

export function deleteConversation(clientId: string, conversationId: string): boolean {
  const list = conversationsByClient.get(clientId) ?? [];
  const next = list.filter((c) => c.id !== conversationId);
  if (next.length === list.length) return false;
  conversationsByClient.set(clientId, next);
  deleteMessages(conversationId);
  return true;
}

/** Derives a short session title from the first user message. */
export function titleFromFirstMessage(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) return "New session";
  return clean.length <= 42 ? clean : clean.slice(0, 41) + "…";
}
