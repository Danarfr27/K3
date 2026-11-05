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
import type { ChatMessage, ResponseStyle } from "@/types/message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Types
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
// Gunakan import dari @/types/message saja

const PERSONA = (process.env.PERSONA || "").trim();

// Utility functions
function getClientId(req: NextRequest): string {
  const header = req.headers.get("x-k3-client");
  return header && isValidId(header) ? header : "anonymous";
}

function applyPersona(messages: ProviderMessage[]): ProviderMessage[] {
  if (!PERSONA) return messages;
  return [{ role: "system", content: PERSONA }, ...messages];
}

function normalizeContents(contents: IncomingContent[]): ProviderMessage[] {
  return contents
    .map((m): ProviderMessage | null => {
      const rawRole = m?.role;
      const role =
        rawRole === "model"
          ? "assistant"
          : rawRole === "user" || rawRole === "assistant" || rawRole === "system"
          ? rawRole
          : null;

      if (!role) return null;

      const text = Array.isArray(m?.parts)
        ? m.parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("\n")
        : typeof m?.content === "string"
        ? m.content
        : "";

      if (!text.trim()) return null;
      return { role, content: text };
    })
    .filter((m): m is ProviderMessage => m !== null);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "whois"
  );
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// DuckDuckGo Search (GitHub-safe, no ToS violation)
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

interface SearchResult {
  title: string;
  url: string;
  source: string;
  snippet: string;
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  
  try {
    const response = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OSINTBot/1.0)",
          Accept: "text/html",
        },
      }
    );

    if (!response.ok) return results;

    const html = await response.text();
    const linkMatches = html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    const snippetMatches = html.matchAll(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi);
    
    const snippets: string[] = [];
    for (const match of snippetMatches) {
      snippets.push(stripHtml(match[1] || ""));
    }

    let index = 0;
    for (const match of linkMatches) {
      if (results.length >= 10) break;
      
      const url = match[1];
      const title = stripHtml(match[2] || "");
      
      if (!url || !title || seen.has(url)) continue;
      if (!/^https?:\/\//i.test(url)) continue;
      
      seen.add(url);
      let hostname = "";
      try {
        hostname = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }

      results.push({
        title: title.slice(0, 180),
        url,
        source: hostname,
        snippet: (snippets[index] || "Public search result").slice(0, 220),
      });
      index++;
    }
  } catch (error) {
    logger.warn("chat", `Search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return results;
}

// Command parser
function parseCommand(content: string, command: string): string | null {
  const patterns = [
    new RegExp(`^\\/${command}\\s+"([^"]+)"$`, "i"),
    new RegExp(`^\\/${command}\\s+'([^']+)'$`, "i"),
    new RegExp(`^\\/${command}\\s+(.+)$`, "i"),
  ];
  
  for (const pattern of patterns) {
    const match = content.trim().match(pattern);
    if (match) return (match[1] || "").trim();
  }
  return null;
}

function isHelpCommand(content: string): boolean {
  return /^\/(help|menu|commands)\s*$/i.test(content.trim());
}

// OSINT Functions
interface SocialAccount {
  platform: string;
  username: string;
  url: string;
  source: string;
}

async function runSocialOsintLookup(query: string): Promise<SocialAccount[]> {
  const cleanedQuery = query.trim();
  const platforms = ["instagram", "facebook", "twitter", "linkedin", "github", "gitlab"];
  const accountsMap = new Map<string, SocialAccount>();

  await Promise.all(
    platforms.map(async (platform) => {
      const results = await searchDuckDuckGo(`${cleanedQuery} ${platform}`);
      
      for (const item of results) {
        try {
          const parsed = new URL(item.url);
          const hostname = parsed.hostname.replace(/^www\./, "");
          
          if (!hostname.includes(platform)) continue;
          
          const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
          if (!path) continue;
          
          const segments = path.split("/").filter(Boolean);
          const username = segments[0];
          if (!username || username.length < 2) continue;
          
          const key = `${platform}:${username.toLowerCase()}`;
          if (accountsMap.has(key)) continue;
          
          accountsMap.set(key, {
            platform,
            username,
            url: item.url,
            source: hostname,
          });
        } catch {
          continue;
        }
      }
    })
  );

  return [...accountsMap.values()].slice(0, 20);
}

async function runWhoisLookup(query: string) {
  const cleanedQuery = query.trim();
  const searchTerms = [
    `${cleanedQuery} open source github`,
    `${cleanedQuery} official website`,
    `${cleanedQuery} social media`,
  ];

  const allResults: SearchResult[] = [];
  const seen = new Set<string>();

  await Promise.all(
    searchTerms.map(async (term) => {
      const results = await searchDuckDuckGo(term);
      for (const item of results) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        allResults.push(item);
      }
    })
  );

  const socialAccounts = await runSocialOsintLookup(cleanedQuery).catch(() => []);
  
  const domains = [...new Set(allResults.map(r => r.source).filter(s => s && !s.includes("duckduckgo")))].slice(0, 20);
  
  const repositories = allResults
    .filter(item => /github\.com|gitlab\.com|sourceforge\.net/i.test(item.url))
    .map(item => ({
      platform: /github\.com/i.test(item.url) ? "github" : /gitlab\.com/i.test(item.url) ? "gitlab" : "sourceforge",
      title: item.title,
      url: item.url,
      source: item.source,
    }))
    .slice(0, 10);

  return {
    query: cleanedQuery,
    tanggal_pembuatan: new Date().toISOString(),
    publik_saja: true,
    ringkasan: allResults.length > 0 
      ? `Ditemukan ${allResults.length} hasil publik dan ${socialAccounts.length} profil sosial untuk "${cleanedQuery}".`
      : `Tidak ada hasil publik yang relevan untuk "${cleanedQuery}".`,
    hasil_pencarian: allResults.slice(0, 10),
    profil_umum: socialAccounts.slice(0, 20),
    domain_umum: domains,
    repositori_umum: repositories,
    organisasi: domains.slice(0, 10),
    catatan: [
      "Data diambil hanya dari sumber publik.",
      "Tidak ada data pribadi sensitif yang ditampilkan.",
    ],
    nama_file: `${slugify(cleanedQuery)}-whois.json`,
  };
}

interface EntityLookupResult {
  query: string;
  type: string;
  generatedAt: string;
  summary: string;
  results: SearchResult[];
  evidence: { emails?: string[]; phones?: string[]; domains?: string[] };
  filename: string;
}

async function runEntityLookup(
  query: string,
  type: "email" | "company" | "phone" | "domain"
): Promise<EntityLookupResult> {
  const cleanedQuery = query.trim();
  const labelMap = {
    email: "email address",
    company: "company profile",
    phone: "phone number",
    domain: "website domain",
  } as const;

  const results = await searchDuckDuckGo(`${cleanedQuery} ${labelMap[type]}`);
  
  const rawText = results.map(r => `${r.title} ${r.snippet}`).join(" ");
  const evidence: EntityLookupResult["evidence"] = {};

  if (type === "email") {
    evidence.emails = [...new Set(rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].slice(0, 10);
  }
  if (type === "phone") {
    evidence.phones = [...new Set(rawText.match(/\+?[0-9][0-9()\-\s]{8,}[0-9]/g) || [])].slice(0, 10);
  }
  if (type === "domain" || type === "company") {
    evidence.domains = [...new Set(rawText.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi) || [])].slice(0, 10);
  }

  return {
    query: cleanedQuery,
    type,
    generatedAt: new Date().toISOString(),
    summary: results.length > 0 
      ? `Ditemukan ${results.length} hasil untuk "${cleanedQuery}" (${type}).`
      : `Tidak ditemukan hasil untuk "${cleanedQuery}" (${type}).`,
    results: results.slice(0, 10),
    evidence,
    filename: `${slugify(`${cleanedQuery}-${type}`)}-intel.json`,
  };
}

// API Handlers
export async function GET(req: NextRequest) {
  const clientId = getClientId(req);
  return NextResponse.json({
    models: MODELS,
    provider: isRealProvider() ? "configured" : "unconfigured",
    memory: [],
    personaConfigured: Boolean(PERSONA),
    clientId,
  });
}

export async function DELETE() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = checkRateLimit(`chat:${clientKey(req)}`, 30, 60_000);

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // Initialize variables
  let conversationId: string;
  let isNewConversation = false;
  let content = "";
  let model = MODELS[0]?.id || "default";
  let responseStyle: ResponseStyle = "balanced";
  let attachmentIds: string[] | undefined;
  let enriched: string | undefined;
  let userMessage: ChatMessage;
  const isWormgemmaRequest = Array.isArray(body?.contents);

  // Parse request (WormGemma format or standard)
  if (isWormgemmaRequest && body.contents) {
    const incomingMessages = normalizeContents(body.contents);
    if (incomingMessages.length === 0) {
      return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
    }

    const lastUserMessage = [...incomingMessages].reverse().find(m => m.role === "user");
    content = (lastUserMessage?.content || "").slice(0, LIMITS.MAX_MESSAGE_CHARS);

    if (!content) {
      return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
    }

    model = isNonEmptyString(body.model, 64) ? body.model : model;
    responseStyle = body.responseStyle === "concise" || body.responseStyle === "detailed" 
      ? body.responseStyle 
      : "balanced";

    const requestedId = body.conversationId;
    if (requestedId && isValidId(requestedId) && getConversation(clientId, requestedId)) {
      conversationId = requestedId;
    } else {
      conversationId = createConversation(clientId, titleFromFirstMessage(content)).id;
      isNewConversation = true;
    }

    // FIX: Gunakan makeMessage dengan tipe yang benar, jangan pakai 'as ChatMessage' jika tidak perlu
    userMessage = makeMessage({ conversationId, role: "user", content });
    appendMessage(userMessage);
    enriched = content;
  } else {
    if (!isNonEmptyString(body?.content)) {
      return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
    }

    content = body.content.slice(0, LIMITS.MAX_MESSAGE_CHARS);
    model = isNonEmptyString(body.model, 64) ? body.model : model;
    responseStyle = body.responseStyle === "concise" || body.responseStyle === "detailed" 
      ? body.responseStyle 
      : "balanced";
    
    // FIX: Pastikan conversationId selalu terdefinisi
    const requestedConvId = body.conversationId;
    if (requestedConvId && isValidId(requestedConvId) && getConversation(clientId, requestedConvId)) {
      conversationId = requestedConvId;
    } else {
      conversationId = createConversation(clientId, titleFromFirstMessage(content)).id;
      isNewConversation = true;
    }

    attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds : undefined;
    
    // FIX: Buat message dengan tipe yang sesuai
    userMessage = makeMessage({
      conversationId,
      role: "user",
      content,
      attachments: attachmentIds?.length ? attachmentIds.map(id => ({ id, name: "attachment", size: 0, mime: "" })) : undefined,
    });
    
    appendMessage(userMessage);
    enriched = content;

    // Handle attachments
    if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
      for (const id of attachmentIds.slice(0, LIMITS.MAX_FILES_PER_MESSAGE)) {
        if (!isValidId(id)) continue;
        const extracted = getUploadText(clientId, id);
        if (extracted) {
          enriched += `\n\n[Attached file: ${extracted.name}]\n\`\`\`\n${extracted.text.slice(0, 6000)}\n\`\`\``;
        }
      }
    }
  }

  // Command: /help
  if (isHelpCommand(content)) {
    const helpText = [
      "FIRDHAN OSINT COMMANDS",
      "",
      "/help -> tampilkan daftar command",
      "/whois \"nama\" -> cari hasil open-source dan jejak digital",
      "/osint \"nama\" -> cari akun media sosial",
      "/social \"nama\" -> alias dari /osint",
      "/email \"nama\" -> cari email publik",
      "/company \"nama\" -> cari profil perusahaan",
      "/phone \"nama\" -> cari nomor telepon publik",
      "/domain \"nama\" -> cari domain terkait",
      "",
      "Contoh: /whois \"John Doe\"",
    ].join("\n");

    const assistantMessage = makeMessage({
      conversationId,
      role: "assistant",
      content: helpText,
      model: "help-command",
    });
    appendMessage(assistantMessage);
    touchConversation(clientId, conversationId, {
      preview: "HELP COMMANDS",
      deltaMessages: 2,
      title: isNewConversation ? titleFromFirstMessage(content) : undefined,
    });

    return new Response(helpText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Conversation-Id": conversationId,
        "X-User-Message-Id": userMessage.id,
        "X-Provider": "help-command",
      },
    });
  }

  // Command: /whois
  const whoisQuery = parseCommand(content, "whois");
  if (whoisQuery) {
    const lookup = await runWhoisLookup(whoisQuery);
    const whoisText = [
      `WHOIS: ${lookup.query}`,
      `Waktu: ${new Date(lookup.tanggal_pembuatan).toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })}`,
      "",
      `Ringkasan: ${lookup.ringkasan}`,
      "",
      "Hasil pencarian publik:",
      ...(lookup.hasil_pencarian.length > 0 
        ? lookup.hasil_pencarian.map((item, i) => `${i + 1}. ${item.title}\n   URL: ${item.url}\n   Sumber: ${item.source}`)
        : ["Tidak ada hasil."]),
      "",
      lookup.profil_umum.length > 0 
        ? `Profil sosial: ${lookup.profil_umum.slice(0, 5).map(p => `${p.platform} (${p.username})`).join(", ")}`
        : "Profil sosial: tidak ditemukan.",
    ].join("\n");

    const assistantMessage = makeMessage({
      conversationId,
      role: "assistant",
      content: whoisText,
      model: "whois-osint",
    });
    appendMessage(assistantMessage);
    touchConversation(clientId, conversationId, {
      preview: `WHOIS ${lookup.query}`,
      deltaMessages: 2,
      title: isNewConversation ? titleFromFirstMessage(content) : undefined,
    });

    return new Response(whoisText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Conversation-Id": conversationId,
        "X-User-Message-Id": userMessage.id,
        "X-File-Name": lookup.nama_file,
        "X-Provider": "whois-osint",
      },
    });
  }

  // Command: /osint or /social
  const socialQuery = parseCommand(content, "osint") || parseCommand(content, "social");
  if (socialQuery) {
    const accounts = await runSocialOsintLookup(socialQuery);
    const result = {
      query: socialQuery,
      generatedAt: new Date().toISOString(),
      accounts,
      summary: accounts.length > 0 
        ? `Ditemukan ${accounts.length} akun untuk "${socialQuery}".`
        : `Tidak ditemukan akun untuk "${socialQuery}".`,
      filename: `${slugify(socialQuery)}-osint.json`,
    };

    const json = JSON.stringify(result, null, 2);
    const assistantMessage = makeMessage({
      conversationId,
      role: "assistant",
      content: json,
      model: "social-osint",
    });
    appendMessage(assistantMessage);
    touchConversation(clientId, conversationId, {
      preview: `OSINT ${socialQuery}`,
      deltaMessages: 2,
      title: isNewConversation ? titleFromFirstMessage(content) : undefined,
    });

    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Conversation-Id": conversationId,
        "X-User-Message-Id": userMessage.id,
        "X-File-Name": result.filename,
        "X-Provider": "social-osint",
      },
    });
  }

  // Commands: /email, /company, /phone, /domain
  const entityCommands = ["email", "company", "phone", "domain"] as const;
  for (const cmd of entityCommands) {
    const query = parseCommand(content, cmd);
    if (!query) continue;

    const lookup = await runEntityLookup(query, cmd);
    const json = JSON.stringify(lookup, null, 2);
    
    const assistantMessage = makeMessage({
      conversationId,
      role: "assistant",
      content: json,
      model: `${cmd}-intel`,
    });
    appendMessage(assistantMessage);
    touchConversation(clientId, conversationId, {
      preview: `${cmd.toUpperCase()} ${lookup.query}`,
      deltaMessages: 2,
      title: isNewConversation ? titleFromFirstMessage(content) : undefined,
    });

    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Conversation-Id": conversationId,
        "X-User-Message-Id": userMessage.id,
        "X-File-Name": lookup.filename,
        "X-Provider": `${cmd}-intel`,
      },
    });
  }

  // Standard AI chat flow (OpenAI / Fallback)
  const keysString = process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || "";
  const apiKeys = keysString.split(",").map(k => k.trim()).filter(Boolean);
  
  // Konfigurasi untuk SumoPod/OpenAI
  const OPENAI_BASE_URL = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";
  const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

  let messagesForProvider: ProviderMessage[] = [];

  if (apiKeys.length > 0) {
    if (isWormgemmaRequest && body.contents) {
      messagesForProvider = normalizeContents(body.contents);
    } else {
      const history = getMessages(conversationId);
      const contextMessages = buildContext({ history, responseStyle });
      
      messagesForProvider = contextMessages
        .slice(-LIMITS.MAX_MESSAGES_PER_REQUEST)
        .map(msg => ({
          role: msg.role === "system" || msg.role === "user" || msg.role === "assistant" ? msg.role : "user",
          content: msg.content,
        }));

      if (enriched !== undefined && enriched !== content && messagesForProvider.length > 0) {
        for (let i = messagesForProvider.length - 1; i >= 0; i--) {
          if (messagesForProvider[i].role === "user") {
            messagesForProvider[i].content = enriched;
            break;
          }
        }
      }
    }

    messagesForProvider = applyPersona(messagesForProvider);

    for (let attempt = 0; attempt < apiKeys.length; attempt++) {
      const apiKey = apiKeys[attempt];
      try {
        const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: messagesForProvider,
            stream: true,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          logger.warn("chat", `OpenAI attempt ${attempt + 1} failed [${response.status}]: ${errText}`);
          
          if ([429, 401, 403].includes(response.status) && attempt < apiKeys.length - 1) {
            continue;
          }
          break;
        }

        const responseBodyStream = response.body;
        if (!responseBodyStream) throw new Error("Response body is null");

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let fullAssistantContent = "";

        const stream = new ReadableStream({
          async start(controller) {
            const reader = responseBodyStream.getReader();
            let buffer = "";

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed.startsWith(":") || trimmed === "data: [DONE]") continue;

                  if (trimmed.startsWith("data: ")) {
                    try {
                      const json = JSON.parse(trimmed.slice(6)) as {
                        choices?: Array<{ delta?: { content?: string } }>;
                      };
                      const delta = json?.choices?.[0]?.delta?.content || "";
                      if (delta) {
                        const cleanDelta = repairRepeatedTokens(fullAssistantContent, delta);
                        fullAssistantContent = appendStreamText(fullAssistantContent, cleanDelta);
                        controller.enqueue(encoder.encode(cleanDelta));
                      }
                    } catch {
                      // ignore invalid JSON
                    }
                  }
                }
              }
            } catch (err) {
              logger.error("chat", `Stream error: ${err instanceof Error ? err.message : String(err)}`);
              controller.error(err);
            } finally {
              reader.releaseLock();
              
              if (fullAssistantContent.trim()) {
                const assistantMessage = makeMessage({
                  conversationId,
                  role: "assistant",
                  content: fullAssistantContent,
                  model: OPENAI_MODEL,
                });
                appendMessage(assistantMessage);
                touchConversation(clientId, conversationId, {
                  preview: fullAssistantContent.slice(0, 100),
                  deltaMessages: 2,
                  title: isNewConversation ? titleFromFirstMessage(content) : undefined,
                });
              }
              controller.close();
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Conversation-Id": conversationId,
            "X-User-Message-Id": userMessage.id,
            "X-Provider": "openai",
            "X-Model": OPENAI_MODEL,
          },
        });
      } catch (error) {
        logger.error("chat", `Attempt ${attempt + 1} exception: ${error instanceof Error ? error.message : String(error)}`);
        if (attempt === apiKeys.length - 1) break;
      }
    }
  }

  // Fallback provider
  const provider = getProvider();
  if (provider) {
    try {
      const messagesForFallback = applyPersona(
        messagesForProvider.length > 0 
          ? messagesForProvider 
          : [{ role: "user", content: enriched || content }]
      );

      const stream = await provider.chatStream({ model, messages: messagesForFallback });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Conversation-Id": conversationId,
          "X-User-Message-Id": userMessage.id,
          "X-Provider": "local-provider",
        },
      });
    } catch (fallbackError) {
      logger.error("chat", `Fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
    }
  }

  return NextResponse.json(
    { error: "PROVIDER_ERROR", message: "Gagal terhubung ke layanan AI." },
    { status: 502 }
  );
}
