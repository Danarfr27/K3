"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ResponseStyle } from "@/types/message";
import type { Conversation } from "@/types/conversation";
import type { AIModel } from "@/types/model";
import type { UploadedFile } from "@/types/chat";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import Sidebar from "@/components/sidebar/Sidebar";
import ImageGenerator from "@/components/image/ImageGenerator";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Loading from "@/components/ui/Loading";
import { isValidId } from "@/lib/utils/validation";
import { appendStreamText, repairRepeatedTokens } from "@/lib/chat/text";

/* ============================================================
   ChatLayout — the application orchestrator (client component)
   ============================================================ */

const QUICK_PROMPTS = [
  "Analyze this text",
  "Summarize this document",
  "Explain this code",
  "Generate an image",
  "Help me research a topic",
];

interface SendParams {
  content: string;
  files: UploadedFile[];
  regenerate?: boolean;
}

function getOrCreateClientId(): string {
  try {
    const existing = localStorage.getItem("k3_client_id");
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 24)
        : `k3${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem("k3_client_id", id);
    return id;
  } catch {
    return "anonymous";
  }
}

const CHAT_HISTORY_KEY = "k3_chat_history_v1";
function readStoredHistory(): {
  activeId: string | null;
  conversations: Conversation[];
  messageCache: Record<string, ChatMessage[]>;
} | null {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<{
      activeId: string | null;
      conversations: Conversation[];
      messageCache: Record<string, ChatMessage[]>;
    }>;

    if (!parsed || typeof parsed !== "object") return null;

    const storedMessageCache =
      parsed.messageCache && typeof parsed.messageCache === "object"
        ? parsed.messageCache
        : {};

    return {
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      conversations: Array.isArray(parsed.conversations)
        ? parsed.conversations.map((conversation) => ({
            ...conversation,
            preview: conversation.preview
              ? repairRepeatedTokens(conversation.preview)
              : conversation.preview,
          }))
        : [],
      messageCache: Object.fromEntries(
        Object.entries(storedMessageCache).map(([id, messages]) => [
          id,
          Array.isArray(messages)
            ? messages.map((message) => ({
                ...message,
                content: repairRepeatedTokens(message.content),
              }))
            : [],
        ])
      ),
    };
  } catch {
    return null;
  }
}

export default function ChatLayout() {
  const [clientId, setClientId] = useState("anonymous");
  const [models, setModels] = useState<AIModel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageCache, setMessageCache] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [online, setOnline] = useState(true);
  const [booted, setBooted] = useState(false);

  // settings
  const [model, setModel] = useState("worm-gpt");
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>("balanced");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // panels
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [imageGenOpen, setImageGenOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // retry support
  const lastSendRef = useRef<SendParams | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const headers = useCallback(
    () => ({ "x-k3-client": clientId, "Content-Type": "application/json" }),
    [clientId]
  );

  /* ---------- boot ---------- */
  useEffect(() => {
    setClientId(getOrCreateClientId());
    try {
      const savedTheme = localStorage.getItem("k3_theme");
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (clientId === "anonymous") return;

    const stored = readStoredHistory();
    if (!stored) return;

    if (stored.conversations.length > 0) {
      setConversations(stored.conversations);
    }

    if (stored.activeId && isValidId(stored.activeId)) {
      setActiveId(stored.activeId);
      const cached = stored.messageCache[stored.activeId] ?? [];
      if (cached.length > 0) {
        setMessages(cached);
      }
    }

    if (Object.keys(stored.messageCache).length > 0) {
      setMessageCache(stored.messageCache);
    }
  }, [clientId]);

  useEffect(() => {
    if (!booted || clientId === "anonymous") return;

    const payload = {
      activeId,
      conversations,
      messageCache: {
        ...messageCache,
        ...(activeId ? { [activeId]: messages } : {}),
      },
    };

    try {
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(payload));
    } catch {
      /* noop */
    }
  }, [activeId, booted, clientId, conversations, messageCache, messages]);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    try {
      localStorage.setItem("k3_theme", theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { headers: headers() });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { conversations: Conversation[] };
      setConversations(data.conversations);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [headers]);

  useEffect(() => {
    if (clientId === "anonymous") return;
    void (async () => {
      const stored = readStoredHistory();
      const savedActiveId =
        stored?.activeId ??
        (() => {
          try {
            return localStorage.getItem("k3_active_id");
          } catch {
            return null;
          }
        })();

      if (stored?.conversations.length) {
        setConversations(stored.conversations);
      }
      if (savedActiveId && isValidId(savedActiveId)) {
        setActiveId(savedActiveId);
        const cached = stored?.messageCache[savedActiveId] ?? [];
        if (cached.length > 0) {
          setMessages(cached);
          setMessageCache((prev) => ({ ...prev, [savedActiveId]: cached }));
        }
      }

      try {
        const res = await fetch("/api/chat", { headers: headers() });
        const data = await res.json();
        setModels(data.models ?? []);
        setOnline(true);
      } catch {
        setOnline(false);
      }
      await refreshConversations();
      // Restore the last opened session after the server refresh.
      if (savedActiveId && isValidId(savedActiveId)) {
        try {
          const res = await fetch(
            `/api/conversations?id=${encodeURIComponent(savedActiveId)}`,
            { headers: headers() }
          );
          if (res.ok) {
            const data = await res.json();
            const nextMessages = data.messages ?? [];
            setMessages(nextMessages);
            setMessageCache((prev) => ({
              ...prev,
              [savedActiveId]: nextMessages,
            }));
          }
        } catch {
          // Keep the locally cached messages when the server is unavailable.
        }
      }
      setBooted(true);
    })();
  }, [clientId, headers, refreshConversations]);

  /* ---------- conversation ops ---------- */
  const openConversation = useCallback(
    async (id: string) => {
      setActiveId(id);
      setFiles([]);
      try {
        localStorage.setItem("k3_active_id", id);
      } catch {
        /* noop */
      }
      try {
        const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
          headers: headers(),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const nextMessages = data.messages ?? [];
        setMessages(nextMessages);
        setMessageCache((prev) => ({ ...prev, [id]: nextMessages }));
        setOnline(true);
      } catch {
        setOnline(false);
      }
    },
    [headers]
  );

  const newChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setFiles([]);
    setInput("");
    setSidebarOpen(false);
    try {
      localStorage.removeItem("k3_active_id");
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setMessageCache((prev) => ({ ...prev, [activeId]: messages }));
  }, [activeId, messages]);

  const deleteConversation = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) {
        setOnline(false);
        return;
      }

      setConversations((previous) => previous.filter((conversation) => conversation.id !== id));
      setMessageCache((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      if (activeIdRef.current === id) newChat();
      try {
        const stored = readStoredHistory();
        if (stored) {
          const nextCache = { ...stored.messageCache };
          delete nextCache[id];
          localStorage.setItem(
            CHAT_HISTORY_KEY,
            JSON.stringify({
              ...stored,
              activeId: stored.activeId === id ? null : stored.activeId,
              conversations: stored.conversations.filter((conversation) => conversation.id !== id),
              messageCache: nextCache,
            })
          );
        }
      } catch {
        /* noop */
      }
      setOnline(true);
    },
    [headers, newChat]
  );

  /* ---------- send + streaming ---------- */
  const send = useCallback(
    async (params: SendParams) => {
      if (streaming) return;
      const { content, files: attached, regenerate } = params;
      lastSendRef.current = params;
      const now = Date.now();
      const convoId = activeIdRef.current ?? "pending";

      // optimistic UI
      const userMsg: ChatMessage = {
        id: `local_u_${now}`,
        conversationId: convoId,
        role: "user",
        content,
        createdAt: now,
        attachments: attached.map((f) => ({ id: f.id, name: f.name, size: f.size, mime: f.mime })),
      };
      const assistantMsg: ChatMessage = {
        id: `local_a_${now}`,
        conversationId: convoId,
        role: "assistant",
        content: "",
        createdAt: now + 1,
        model,
      };

      setMessages((prev) => {
        const base = regenerate ? dropLastAssistant(prev) : prev;
        return regenerate ? [...base, assistantMsg] : [...base, userMsg, assistantMsg];
      });
      setFiles([]);
      setStreaming(true);
      setThinking(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            conversationId: activeIdRef.current ?? undefined,
            content,
            model,
            responseStyle,
            attachmentIds: attached.map((f) => f.id),
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const newConvoId = res.headers.get("X-Conversation-Id");
        const assistantId = res.headers.get("X-Assistant-Message-Id");
        const userId = res.headers.get("X-User-Message-Id");

        if (newConvoId && newConvoId !== activeIdRef.current) {
          setActiveId(newConvoId);
          userMsg.conversationId = newConvoId;
          assistantMsg.conversationId = newConvoId;
        }
        if (assistantId) assistantMsg.id = assistantId;
        if (userId) userMsg.id = userId;

        const reader = res.body?.getReader();
        if (!reader) throw new Error("Response stream unavailable");

        const decoder = new TextDecoder();
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc = appendStreamText(acc, decoder.decode(value, { stream: true }));
          const current = repairRepeatedTokens(acc);
          setThinking(false);
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.findIndex((m) => m.id === assistantMsg.id);
            if (idx >= 0) next[idx] = { ...next[idx], content: current };
            return next;
          });
        }
        acc += decoder.decode();
        setThinking(false);

        const contentType = res.headers.get("Content-Type") || "";
        let finalContent = repairRepeatedTokens(acc).replace(
          /\b(import){2,}\b/g,
          "import"
        );
        if (contentType.includes("application/json") && acc.trim()) {
          try {
            const parsed = JSON.parse(acc);
            finalContent = `\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
          } catch {
            // leave as raw text if not valid JSON
          }
        }

        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.id === assistantMsg.id);
          if (idx >= 0) next[idx] = { ...next[idx], content: finalContent };
          return next;
        });

        if (acc.includes("[K3 CONNECTION INTERRUPTED]")) {
          markError(assistantMsg.id);
        }
        setOnline(true);
        void refreshConversations();
      } catch {
        setOnline(false);
        markError(assistantMsg.id);
      } finally {
        setStreaming(false);
        setThinking(false);
      }

      function markError(id: string) {
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.id === id);
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              content: next[idx].content || "Signal lost while contacting the provider.",
              error: true,
            };
          }
          return next;
        });
      }
    },
    [
      streaming,
      headers,
      model,
      responseStyle,
      refreshConversations,
    ]
  );

  const retry = useCallback(() => {
    const last = lastSendRef.current;
    if (!last) return;
    void send({ ...last, regenerate: true });
  }, [send]);

  const regenerate = useCallback(() => {
    // find last user message and regenerate the answer
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    void send({ content: lastUser.content, files: [], regenerate: true });
  }, [messages, send]);

  /* ---------- settings ops ---------- */
  const clearConversation = useCallback(async () => {
    if (activeIdRef.current) await deleteConversation(activeIdRef.current);
    newChat();
    setSettingsOpen(false);
  }, [deleteConversation, newChat]);

  const logout = useCallback(async () => {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => undefined);
    window.location.assign("/login");
  }, []);

  /* ---------- render ---------- */
  const empty = messages.length === 0;

  return (
    <div className="chat-shell scanlines flex h-dvh overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => void openConversation(id)}
        onNew={newChat}
        onDelete={(id) => void deleteConversation(id)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          models={models}
          model={model}
          onModelChange={setModel}
          online={online}
          onToggleSidebar={() => setSidebarOpen(true)}
          onOpenImageGen={() => setImageGenOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          theme={theme}
          onToggleTheme={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
          onLogout={() => void logout()}
        />

        {/* chat area */}
        <div className="chat-message-area min-h-0 flex-1 overflow-y-auto">
          {!booted ? (
            <div className="flex h-full items-center justify-center">
              <Loading label="FE34RD00WN IS COMBACK" />
            </div>
          ) : empty ? (
            <HeroState
              onQuickPrompt={(p) => {
                if (p === "Generate an image") setImageGenOpen(true);
                else setInput(p + ": ");
              }}
            />
          ) : (
            <div className="mx-auto w-full max-w-3xl">
              <MessageList
                messages={messages}
                streaming={streaming}
                thinking={thinking}
                onRegenerate={regenerate}
              />
              {messages.some((m) => m.error) && !streaming && (
                <div className="flex justify-center pb-4">
                  <Button variant="danger" size="sm" onClick={retry}>
                    [ RETRY ]
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <ChatInput
          clientId={clientId}
          disabled={streaming}
          files={files}
          onAddFile={(f) => setFiles((prev) => [...prev, f].slice(0, 3))}
          onRemoveFile={(id) => setFiles((prev) => prev.filter((f) => f.id !== id))}
          onSend={(text) => void send({ content: text, files })}
          value={input}
          onValueChange={setInput}
        />
      </main>

      <ImageGenerator open={imageGenOpen} onClose={() => setImageGenOpen(false)} />

      {/* settings */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="SETTINGS">
        <div className="flex flex-col gap-4">
          <SettingRow label="MODEL">
            <div className="flex flex-wrap gap-1.5">
              {models.map((m) => (
                <Button
                  key={m.id}
                  size="sm"
                  variant={m.id === model ? "primary" : "outline"}
                  onClick={() => setModel(m.id)}
                >
                  {m.name}
                </Button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="THEME">
            <div className="flex gap-1.5">
              <Button size="sm" variant={theme === "dark" ? "primary" : "outline"} onClick={() => setTheme("dark")}>
                DARK
              </Button>
              <Button size="sm" variant={theme === "light" ? "primary" : "outline"} onClick={() => setTheme("light")}>
                LIGHT
              </Button>
            </div>
          </SettingRow>

          <SettingRow label="RESPONSE STYLE">
            <div className="flex gap-1.5">
              {(["concise", "balanced", "detailed"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={responseStyle === s ? "primary" : "outline"}
                  onClick={() => setResponseStyle(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </SettingRow>

          <div className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
            <Button variant="outline" size="sm" onClick={() => void clearConversation()}>
              CLEAR CONVERSATION
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- hero / empty state ---------- */

function HeroState({
  onQuickPrompt,
}: {
  onQuickPrompt: (p: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 animate-msg-in">
      <pre className="neon-gradient-text select-none text-center font-mono text-[13px] leading-tight drop-shadow-[0_0_12px_rgba(0,255,156,0.35)]">
{`
██╗  ██╗██████╗
██║ ██╔╝╚════██╗
█████╔╝  █████╔╝
██╔═██╗  ╚═══██╗
██║  ██╗██████╔╝
╚═╝  ╚═╝╚═════╝
`}
      </pre>

      <div className="neon-gradient-text mt-2 font-mono text-[10px] uppercase tracking-[0.5em]">
        CYBER INTELLIGENCE AI
      </div>

      <p className="neon-gradient-text mt-6 font-mono text-sm">
        &quot;How can I assist you?&quot;
        <span className="terminal-cursor" />
      </p>

      <div className="mt-8 flex w-full max-w-md flex-col gap-1.5">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onQuickPrompt(p)}
            className="neon-gradient-text quick-prompt rounded border border-line bg-panel/50 px-3.5 py-2 text-left font-mono text-xs"
          >
            <span className="mr-2 text-terminal/70">&gt;</span>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">{label}</span>
      {children}
    </div>
  );
}

function dropLastAssistant(messages: ChatMessage[]): ChatMessage[] {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].role === "assistant") {
      next.splice(i, 1);
      break;
    }
  }
  return next;
}
