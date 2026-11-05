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
import type { ResponseStyle } from "@/types/message";

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

interface ChatMessage {
  id: string;
  role: string;
  content: string;
}

const PERSONA = (process.env.PERSONA || "").trim();

function getClientId(req: NextRequest): string {
  const header = req.headers.get("x-k3-client");
  return header && isValidId(header) ? header : "anonymous";
}

function applyPersona(messages: ProviderMessage[]): ProviderMessage[] {
  if (!PERSONA) return messages;

  return [
    {
      role: "system",
      content: PERSONA,
    },
    ...messages,
  ];
}

function normalizeContents(contents: IncomingContent[]): ProviderMessage[] {
  return contents
    .map((m): ProviderMessage | null => {
      const rawRole = m?.role;

      const role =
        rawRole === "model"
          ? "assistant"
          : rawRole === "user" ||
            rawRole === "assistant" ||
            rawRole === "system"
          ? rawRole
          : null;

      if (!role) return null;

      const text = Array.isArray(m?.parts)
        ? m.parts
            .map((p) => (typeof p?.text === "string" ? p.text : ""))
            .join("\n")
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

function decodeGoogleUrl(rawUrl: string): string {
  try {
    const decoded = decodeURIComponent(rawUrl);
    const withoutTracking = decoded.replace(/^https?:\/\/.*?\?q=/i, "");
    if (
      withoutTracking.startsWith("http://") ||
      withoutTracking.startsWith("https://")
    ) {
      return withoutTracking;
    }
    const url = decoded.match(/(?:https?:\/\/[^&\s]+)/i)?.[0];
    return url || decoded;
  } catch {
    return rawUrl;
  }
}

function extractSearchResults(
  html: string
): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /<a[^>]+href="(https?:\/\/[^"#]+|\/url\?q=([^"&]+)[^"&]*)"[^>]*>([\s\S]*?)<\/a>/gi
  )) {
    const rawHref = match[1] || "";
    const candidate = rawHref.startsWith("/url?q=") ? match[2] || "" : rawHref;
    const href = decodeGoogleUrl(candidate || rawHref);
    if (!href || !/^https?:\/\//i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);

    const text = stripHtml(match[3] || "");
    if (!text) continue;

    results.push({
      title: text.slice(0, 180),
      url: href,
      snippet: "",
    });

    if (results.length >= 10) break;
  }

  const snippetMatches = html.matchAll(
    /<span class="[^"]*?(?:BNeawe|VwiC3b|s3v9rd|AP7Wnd)[^"]*">([\s\S]*?)<\/span>/gi
  );
  let snippetIndex = 0;
  for (const snippetMatch of snippetMatches) {
    const snippet = stripHtml(snippetMatch[1] || "");
    if (!snippet) continue;
    if (results[snippetIndex]) {
      results[snippetIndex].snippet = snippet.slice(0, 220);
      snippetIndex += 1;
    }
  }

  return results.filter((item) => item.title && item.url);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 3000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function runWhoisLookup(query: string): Promise<{
  query: string;
  tanggal_pembuatan: string;
  publik_saja: boolean;
  ringkasan: string;
  hasil_pencarian: Array<{ title: string; url: string; source: string; snippet: string }>;
  profil_umum: Array<{ platform: string; username: string; url: string; source: string }>;
  domain_umum: string[];
  repositori_umum: Array<{ platform: string; title: string; url: string; source: string }>;
  organisasi: string[];
  catatan: string[];
  nama_file: string;
}> {
  const cleanedQuery = query.trim();
  const searchTerms = [
    `${cleanedQuery} open source github`,
    `${cleanedQuery} github repo`,
    `${cleanedQuery} gitlab repo`,
    `${cleanedQuery} official website`,
  ];

  const allResults: Array<{ title: string; url: string; source: string; snippet: string }> = [];
  const seen = new Set<string>();

  await Promise.all(
    searchTerms.map(async (term) => {
      const url = `https://www.google.com/search?hl=en&q=${encodeURIComponent(term)}&num=5`;
      try {
        const response = await fetchWithTimeout(
          url,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
            },
          },
          3000
        );

        if (!response.ok) return;

        const html = await response.text();
        const parsed = extractSearchResults(html);

        for (const item of parsed) {
          if (seen.has(item.url)) continue;
          seen.add(item.url);
          const source = new URL(item.url).hostname.replace(/^www\./, "");
          allResults.push({
            title: item.title,
            url: item.url,
            source,
            snippet: item.snippet || "Public result from an indexable web source.",
          });
        }
      } catch (error) {
        logger.warn(
          "chat",
          `whois lookup failed for query: ${term} :: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  const publicProfiles = await runSocialOsintLookup(cleanedQuery)
    .then((data) => data.accounts)
    .catch(() => [] as Array<{ platform: string; username: string; url: string; source: string }>);

  const publicDomains = [
    ...new Set(
      allResults
        .map((item) => item.source)
        .filter((source) => source && !source.includes("google"))
    ),
  ].slice(0, 20);

  const publicRepositories = allResults
    .filter((item) => /github\.com|gitlab\.com|sourceforge\.net/i.test(item.url))
    .map((item) => ({
      platform: /github\.com/i.test(item.url)
        ? "github"
        : /gitlab\.com/i.test(item.url)
        ? "gitlab"
        : "sourceforge",
      title: item.title,
      url: item.url,
      source: item.source,
    }))
    .slice(0, 10);

  const organizations = [
    ...new Set(allResults.map((item) => item.source).filter(Boolean)),
  ].slice(0, 20);

  return {
    query: cleanedQuery,
    tanggal_pembuatan: new Date().toISOString(),
    publik_saja: true,
    ringkasan:
      allResults.length > 0 || publicProfiles.length > 0 || publicRepositories.length > 0
        ? `Ditemukan ${allResults.length} hasil publik, ${publicProfiles.length} profil sosial publik, dan ${publicRepositories.length} repo/proyek publik yang relevan untuk "${cleanedQuery}".`
        : `Tidak ada hasil publik yang relevan untuk "${cleanedQuery}" pada pencarian terbuka saat ini.`,
    hasil_pencarian: allResults.slice(0, 10),
    profil_umum: publicProfiles.slice(0, 20),
    domain_umum: publicDomains,
    repositori_umum: publicRepositories,
    organisasi: organizations,
    catatan: [
      "Data diambil hanya dari sumber publik yang dapat diakses secara terbuka.",
      "Data pribadi sensitif tidak ditampilkan.",
    ],
    nama_file: `${slugify(cleanedQuery)}-whois.json`,
  };
}

function isWhoisCommand(content: string): string | null {
  const match = content.trim().match(/^\/whois\s+(?:"([^"]+)"|'([^']+)'|(.+))$/i);
  if (!match) return null;
  return (match[1] || match[2] || match[3] || "").trim();
}

function isSocialCommand(content: string): string | null {
  const match = content
    .trim()
    .match(/^\/(?:osint|social)\s+(?:"([^"]+)"|'([^']+)'|(.+))$/i);
  if (!match) return null;
  return (match[1] || match[2] || match[3] || "").trim();
}

function isHelpCommand(content: string): boolean {
  return /^\/(help|menu|commands)\s*$/i.test(content.trim());
}

function getCommandQuery(content: string, names: string[]): string | null {
  const pattern = new RegExp(`^\\/(${names.join("|")})\\s+(?:\"([^\"]+)\"|'([^']+)'|(.+))$`, "i");
  const match = content.trim().match(pattern);
  if (!match) return null;
  return (match[2] || match[3] || match[4] || "").trim();
}

function isEntityCommand(content: string, name: string): string | null {
  return getCommandQuery(content, [name]);
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
}

function extractUsernameFromUrl(url: string, platform: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (!path) return "";

    const segments = path.split("/").filter(Boolean);

    if (
      platform === "instagram" ||
      platform === "facebook" ||
      platform === "twitter" ||
      platform === "x" ||
      platform === "threads" ||
      platform === "linkedin" ||
      platform === "pinterest" ||
      platform === "tiktok" ||
      platform === "youtube" ||
      platform === "reddit" ||
      platform === "github" ||
      platform === "gitlab" ||
      platform === "telegram"
    ) {
      const candidate = segments[0];
      if (candidate && !/[?&=]/.test(candidate)) return candidate;
    }

    if (platform === "linkedin") {
      return segments[0] || "";
    }

    return segments.join("/").split("?")[0] || "";
  } catch {
    return "";
  }
}

function classifyPlatform(hostname: string): string | null {
  const host = normalizeHostname(hostname);
  if (host.includes("instagram.")) return "instagram";
  if (host.includes("facebook.")) return "facebook";
  if (host.includes("twitter.") || host.includes("x.com")) return "twitter";
  if (host.includes("threads.")) return "threads";
  if (host.includes("linkedin.")) return "linkedin";
  if (host.includes("tiktok.")) return "tiktok";
  if (host.includes("youtube.")) return "youtube";
  if (host.includes("github.")) return "github";
  if (host.includes("gitlab.")) return "gitlab";
  if (host.includes("reddit.")) return "reddit";
  if (host.includes("telegram.")) return "telegram";
  if (host.includes("pinterest.")) return "pinterest";
  if (host.includes("vk.")) return "vk";
  if (host.includes("medium.")) return "medium";
  if (host.includes("discord.")) return "discord";
  if (host.includes("tumblr.")) return "tumblr";
  return null;
}

function extractSocialUrlsFromHtml(html: string): string[] {
  const urls = new Set<string>();

  for (const match of html.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    const raw = match[0].replace(/[),.;]+$/, "");
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        urls.add(parsed.toString());
      }
    } catch {
      // ignore
    }
  }

  return [...urls];
}

async function runSocialOsintLookup(query: string): Promise<{
  query: string;
  generatedAt: string;
  summary: string;
  accounts: Array<{ platform: string; username: string; url: string; source: string }>;
  filename: string;
}> {
  const cleanedQuery = query.trim();
  const platforms = [
    "instagram",
    "facebook",
    "twitter",
    "linkedin",
    "tiktok",
    "github",
    "gitlab",
  ];

  const accountsMap = new Map<string, { platform: string; username: string; url: string; source: string }>();

  await Promise.all(
    platforms.map(async (platform) => {
      const searchUrl = `https://www.google.com/search?hl=en&q=${encodeURIComponent(`${cleanedQuery}${platform}`)}&num=5`;

      try {
        const response = await fetchWithTimeout(
          searchUrl,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
            },
          },
          3000
        );

        if (!response.ok) return;
        const html = await response.text();
        const urls = extractSocialUrlsFromHtml(html);

        for (const candidate of urls) {
          let parsed: URL;
          try {
            parsed = new URL(candidate);
          } catch {
            continue;
          }

          const platformName = classifyPlatform(parsed.hostname);
          if (!platformName || !platformName.includes(platform)) {
            continue;
          }

          const username = extractUsernameFromUrl(candidate, platformName);
          if (!username) continue;

          const normalizedKey = `${platformName}:${username.toLowerCase()}`;
          if (accountsMap.has(normalizedKey)) continue;

          accountsMap.set(normalizedKey, {
            platform: platformName,
            username,
            url: candidate,
            source: parsed.hostname.replace(/^www\./, ""),
          });
        }
      } catch (error) {
        logger.warn(
          "chat",
          `osint lookup failed for ${platform}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  const accounts = [...accountsMap.values()].slice(0, 20);

  return {
    query: cleanedQuery,
    generatedAt: new Date().toISOString(),
    summary:
      accounts.length > 0
        ? `Ditemukan ${accounts.length} akun media sosial yang kemungkinan aktif untuk "${cleanedQuery}".`
        : `Tidak ditemukan akun media sosial yang relevan untuk "${cleanedQuery}" pada pencarian publik saat ini.`,
    accounts,
    filename: `${slugify(cleanedQuery)}-osint-social.json`,
  };
}

async function runEntityLookup(
  query: string,
  type: "email" | "company" | "phone" | "domain"
): Promise<{
  query: string;
  type: string;
  generatedAt: string;
  summary: string;
  results: Array<{ title: string; url: string; source: string; snippet: string; match?: string }>;
  evidence: { emails?: string[]; phones?: string[]; domains?: string[] };
  filename: string;
}> {
  const cleanedQuery = query.trim();
  const labelMap: Record<typeof type, string> = {
    email: "email address",
    company: "company profile",
    phone: "phone number",
    domain: "website domain",
  };

  const searchUrl = `https://www.google.com/search?hl=en&q=${encodeURIComponent(`${cleanedQuery}${labelMap[type]}`)}&num=8`;
  const results: Array<{ title: string; url: string; source: string; snippet: string; match?: string }> = [];
  const seen = new Set<string>();

  try {
    const response = await fetchWithTimeout(
      searchUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      3000
    );

    if (response.ok) {
      const html = await response.text();
      const extracted = extractSearchResults(html);
      for (const item of extracted) {
        if (!item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        const source = new URL(item.url).hostname.replace(/^www\./, "");
        results.push({
          title: item.title,
          url: item.url,
          source,
          snippet: item.snippet || "Publicly indexed search result.",
        });
      }
    }
  } catch (error) {
    logger.warn(
      "chat",
      `entity lookup failed for ${type}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const rawText = results.map((item) => `${item.title} ${item.snippet}`).join(" ");
  const evidence: { emails?: string[]; phones?: string[]; domains?: string[] } = {};

  if (type === "email") {
    evidence.emails = [...new Set((rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).slice(0, 10))];
  }
  if (type === "phone") {
    evidence.phones = [...new Set((rawText.match(/\+?[0-9][0-9()\-\s]{8,}[0-9]/g) || []).slice(0, 10))];
  }
  if (type === "domain" || type === "company") {
    evidence.domains = [...new Set((rawText.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi) || []).slice(0, 10))];
  }

  const filename = `${slugify(`${cleanedQuery}-${type}`)}-intel.json`;

  return {
    query: cleanedQuery,
    type,
    generatedAt: new Date().toISOString(),
    summary:
      results.length > 0
        ? `Ditemukan ${results.length} hasil publik relevan untuk "${cleanedQuery}" pada kategori ${type}.`
        : `Tidak ditemukan hasil publik relevan untuk "${cleanedQuery}" pada kategori ${type}.`,
    results: results.slice(0, 10),
    evidence,
    filename,
  };
}

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

  let conversationId: string | undefined;
  let isNewConversation = false;
  let content = "";
  let model = MODELS[0]?.id || "default";
  let responseStyle: ResponseStyle = "balanced";
  let attachmentIds: string[] | undefined;
  let enriched: string | undefined;
  let userMessage: ChatMessage | undefined;
  const isWormgemmaRequest = Array.isArray(body?.contents);

  if (isWormgemmaRequest && body.contents) {
    const incomingMessages = normalizeContents(body.contents);

    if (incomingMessages.length === 0) {
      return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
    }

    const lastUserMessage = [...incomingMessages]
      .reverse()
      .find((message) => message.role === "user");

    content = (lastUserMessage?.content || "").slice(
      0,
      LIMITS.MAX_MESSAGE_CHARS
    );

    if (!content) {
      return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
    }

    model = isNonEmptyString(body.model, 64) ? body.model : model;
    responseStyle =
      body.responseStyle === "concise" || body.responseStyle === "detailed"
        ? body.responseStyle
        : "balanced";

    const requestedConversationId = body.conversationId;

    if (
      requestedConversationId &&
      isValidId(requestedConversationId) &&
      getConversation(clientId, requestedConversationId)
    ) {
      conversationId = requestedConversationId;
    } else {
      conversationId = createConversation(
        clientId,
        titleFromFirstMessage(content)
      ).id;
      isNewConversation = true;
    }

    userMessage = makeMessage({
      conversationId,
      role: "user",
      content,
    }) as ChatMessage;

    appendMessage(userMessage);
    enriched = content;
  } else {
    if (!isNonEmptyString(body?.content)) {
      return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
    }

    content = body.content.slice(0, LIMITS.MAX_MESSAGE_CHARS);
    model = isNonEmptyString(body.model, 64) ? body.model : model;
    responseStyle =
      body.responseStyle === "concise" || body.responseStyle === "detailed"
        ? body.responseStyle
        : "balanced";

    conversationId = body.conversationId;

    if (
      conversationId &&
      isValidId(conversationId) &&
      getConversation(clientId, conversationId)
    ) {
      // Existing conversation
    } else {
      conversationId = createConversation(
        clientId,
        titleFromFirstMessage(content)
      ).id;
      isNewConversation = true;
    }

    attachmentIds = Array.isArray(body.attachmentIds)
      ? body.attachmentIds
      : undefined;

    userMessage = makeMessage({
      conversationId,
      role: "user",
      content,
      attachments: attachmentIds?.length
        ? attachmentIds.map((id) => ({
            id,
            name: "attachment",
            size: 0,
            mime: "",
          }))
        : undefined,
    }) as ChatMessage;

    appendMessage(userMessage);

    enriched = content;

    if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
      for (const id of attachmentIds.slice(
        0,
        LIMITS.MAX_FILES_PER_MESSAGE
      )) {
        if (!isValidId(id)) continue;

        const extracted = getUploadText(clientId, id);

        if (extracted) {
          enriched += `\n\n[Attached file: ${extracted.name}]\n\`\`\`\n${extracted.text.slice(
            0,
            6000
          )}\n\`\`\``;
        }
      }
    }
  }

  if (isHelpCommand(content)) {
    const helpText = [
      "FIRDHAN OSINT COMMANDS",
      "",
      "/help -> tampilkan daftar command yang tersedia",
      "/whois \"nama\" -> cari hasil open-source, akun sosial media, dan jejak digital lalu kembalikan JSON lengkap",
      "/osint \"nama\" -> cari akun media sosial yang mungkin terkait dengan target",
      "/social \"nama\" -> alias dari /osint",
      "/email \"nama\" -> cari kemungkinan email publik terkait target",
      "/company \"nama\" -> cari profil perusahaan / perusahaan publik terkait target",
      "/phone \"nama\" -> cari kemungkinan nomor telepon publik terkait target",
      "/domain \"nama\" -> cari domain dan profil website terkait target",
      "",
      "Contoh:",
      "/whois \"Firdhan\"",
      "/osint \"John Doe\"",
      "/email \"acme\"",
      "/company \"google\"",
    ].join("\n");

    const assistantMessage = makeMessage({
      conversationId: conversationId as string,
      role: "assistant",
      content: helpText,
      model: "help-command",
    });

    appendMessage(assistantMessage);
    touchConversation(clientId, conversationId as string, {
      preview: "HELP COMMANDS",
      deltaMessages: 2,
      title: isNewConversation
        ? titleFromFirstMessage(content)
        : undefined,
    });

    return new Response(helpText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Conversation-Id": conversationId as string,
        "X-User-Message-Id": userMessage?.id ?? "",
        "X-Provider": "help-command",
      },
    });
  }

  const whoisQuery = isWhoisCommand(content);
  if (whoisQuery) {
    const lookup = await runWhoisLookup(whoisQuery);

    const whoisText = [
      `WHOIS: ${lookup.query}`,
      `Waktu: ${new Date(lookup.tanggal_pembuatan).toLocaleString("id-ID", {
        dateStyle: "full",
        timeStyle: "short",
      })}`,
      `Status: ${lookup.publik_saja ? "Publik saja" : "Umum"}`,
      "",
      `Ringkasan: ${lookup.ringkasan}`,
      "",
      "Hasil pencarian publik:",
      ...(lookup.hasil_pencarian.length > 0
        ? lookup.hasil_pencarian.slice(0, 8).map((item, index) => {
            return `${index + 1}. ${item.title}\n   URL: ${item.url}\n   Sumber: ${item.source}\n   Deskripsi: ${item.snippet}`;
          })
        : ["Tidak ada hasil publik yang relevan yang ditemukan."]),
      "",
      lookup.profil_umum.length > 0
        ? [
            "Profil publik yang mungkin relevan:",
            ...lookup.profil_umum.slice(0, 8).map((profile, index) => {
              return `${index + 1}. ${profile.platform} — ${profile.username}\n   URL: ${profile.url}`;
            }),
          ].join("\n")
        : "Profil publik yang mungkin relevan: tidak ditemukan.",
      "",
      lookup.domain_umum.length > 0
        ? `Domain publik yang terkait: ${lookup.domain_umum.slice(0, 8).join(", ")}`
        : "Domain publik yang terkait: tidak ditemukan.",
      "",
      lookup.repositori_umum.length > 0
        ? [
            "Repo/proyek publik:",
            ...lookup.repositori_umum.slice(0, 6).map((repo, index) => {
              return `${index + 1}. ${repo.platform} — ${repo.title}\n   URL: ${repo.url}`;
            }),
          ].join("\n")
        : "Repo/proyek publik: tidak ditemukan.",
      "",
      lookup.organisasi.length > 0
        ? `Organisasi/entitas umum yang muncul: ${lookup.organisasi.slice(0, 8).join(", ")}`
        : "Organisasi/entitas umum yang muncul: tidak ditemukan.",
      "",
      "Catatan:",
      ...lookup.catatan.map((item) => `- ${item}`),
    ].join("\n");

    const assistantMessage = makeMessage({
      conversationId: conversationId as string,
      role: "assistant",
      content: whoisText,
      model: "whois-osint",
    });

    appendMessage(assistantMessage);
    touchConversation(clientId, conversationId as string, {
      preview: `WHOIS ${lookup.query}`,
      deltaMessages: 2,
      title: isNewConversation
        ? titleFromFirstMessage(content)
        : undefined,
    });

    return new Response(whoisText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Conversation-Id": conversationId as string,
        "X-User-Message-Id": userMessage?.id ?? "",
        "X-File-Name": lookup.nama_file,
        "X-Provider": "whois-osint",
      },
    });
  }

  const socialQuery = isSocialCommand(content);
  if (socialQuery) {
    const lookup = await runSocialOsintLookup(socialQuery);
    const assistantMessage = makeMessage({
      conversationId: conversationId as string,
      role: "assistant",
      content: JSON.stringify(lookup, null, 2),
      model: "social-osint",
    });

    appendMessage(assistantMessage);
    touchConversation(clientId, conversationId as string, {
      preview: `OSINT ${lookup.query}`,
      deltaMessages: 2,
      title: isNewConversation
        ? titleFromFirstMessage(content)
        : undefined,
    });

    return new Response(JSON.stringify(lookup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Conversation-Id": conversationId as string,
        "X-User-Message-Id": userMessage?.id ?? "",
        "X-File-Name": lookup.filename,
        "X-Provider": "social-osint",
      },
    });
  }

  const entityHandlers: Array<{ name: "email" | "company" | "phone" | "domain"; query: string | null }> = [
    { name: "email", query: isEntityCommand(content, "email") },
    { name: "company", query: isEntityCommand(content, "company") },
    { name: "phone", query: isEntityCommand(content, "phone") },
    { name: "domain", query: isEntityCommand(content, "domain") },
  ];

  for (const handler of entityHandlers) {
    if (!handler.query) continue;
    const lookup = await runEntityLookup(handler.query, handler.name);
    const assistantMessage = makeMessage({
      conversationId: conversationId as
