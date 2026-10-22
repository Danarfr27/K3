"use client";

import { useState } from "react";
import type { ChatMessage } from "@/types/message";
import Markdown from "./Markdown";

interface Props {
  message: ChatMessage;
  streaming?: boolean;
  onRegenerate?: () => void;
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageBubble({ message, streaming, onRegenerate }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"like" | "dislike" | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-msg-in`}>
      <div className={`max-w-[92%] sm:max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        {/* meta line */}
        <div
          className={`mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim ${
            isUser ? "justify-end" : ""
          }`}
        >
          <span className={isUser ? "text-ghost" : "text-terminal"}>
            {isUser ? "USER" : "K3"}
          </span>
          {!isUser && message.model && (
            <span className="text-dim/70">[{message.model}]</span>
          )}
          <span>{timeLabel(message.createdAt)}</span>
        </div>

        {/* bubble */}
        <div
          className={
            isUser
              ? "rounded-md border border-line-bright bg-black/75 px-3.5 py-2.5 text-white shadow-[0_2px_12px_rgba(0,0,0,0.45)]"
              : "rounded-md border border-line bg-black/75 px-3.5 py-2.5 text-white"
          }
        >
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {message.attachments.map((a) => (
                <span
                  key={a.id}
                  className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ghost"
                >
                  ▤ {a.name}
                </span>
              ))}
            </div>
          )}

          {isUser ? (
            <p className="whitespace-pre-wrap text-[0.88rem] leading-relaxed text-white">
              {message.content}
            </p>
          ) : (
            <div className={streaming ? "stream-caret" : ""}>
              <Markdown text={message.content || " "} />
            </div>
          )}

          {message.error && (
            <div className="mt-2 border-t border-red-900/40 pt-2 font-mono text-[10px] uppercase tracking-wider text-red-400">
              K3 CONNECTION INTERRUPTED
            </div>
          )}
        </div>

        {/* assistant actions */}
        {!isUser && !streaming && !message.error && (
          <div className="mt-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider">
            <button
              onClick={copy}
              className="rounded px-1.5 py-0.5 text-dim transition-colors hover:text-terminal"
            >
              {copied ? "copied ✓" : "copy"}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="rounded px-1.5 py-0.5 text-dim transition-colors hover:text-cyber"
              >
                regenerate
              </button>
            )}
            <button
              onClick={() => setVote(vote === "like" ? null : "like")}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                vote === "like" ? "text-terminal" : "text-dim hover:text-terminal"
              }`}
              aria-label="Like"
            >
              ▲
            </button>
            <button
              onClick={() => setVote(vote === "dislike" ? null : "dislike")}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                vote === "dislike" ? "text-red-400" : "text-dim hover:text-red-400"
              }`}
              aria-label="Dislike"
            >
              ▼
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
