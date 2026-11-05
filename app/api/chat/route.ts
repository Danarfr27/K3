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
import { getUploadText } from "@/lib/chat/uploads";
import { checkRateLimit, clientKey } from "@/lib/utils/ratelimit";
import { isNonEmptyString, isValidId, LIMITS } from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";
import { appendStreamText, repairRepeatedTokens } from "@/lib/chat/text";
import type { ChatMessage, ResponseStyle } from "@/types/message"; // ← Import ChatMessage di sini

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface ContentPart {
  text?: string;
}

interface IncomingContent {
  role?: string;
  parts?: ContentPart[];
  content?: string;
}

interface RequestBody {
  contents?: IncomingContent[];
  content?: string;
  model?: string;
  responseStyle?: ResponseStyle;
  conversationId?: string;
  attachmentIds?: string[];
}

// HAPUS interface ChatMessage lokal yang duplikat
// interface ChatMessage { ... } ← HAPUS INI

const PERSONA = (process.env.PERSONA || "").trim();

// ... sisa kode tetap sama, tapi pastikan tidak ada lagi 'as ChatMessage' 
// kecuali jika makeMessage memang mengembalikan tipe yang berbeda

// Jika masih error di baris userMessage, gunakan:
// userMessage = makeMessage({ conversationId, role: "user", content });
// (tanpa 'as ChatMessage' jika makeMessage sudah mengembalikan tipe yang benar)
