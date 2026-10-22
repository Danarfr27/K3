"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/types/message";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  thinking: boolean;
  onRegenerate: (messageId: string) => void;
}

export default function MessageList({ messages, streaming, thinking, onRegenerate }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking, streaming]);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-6">
      {messages.map((m, i) => (
        <MessageBubble
          key={m.id}
          message={m}
          streaming={streaming && i === messages.length - 1 && m.role === "assistant"}
          onRegenerate={
            m.role === "assistant" && m.id === lastAssistantId && !streaming
              ? () => onRegenerate(m.id)
              : undefined
          }
        />
      ))}
      {thinking && (
        <div className="flex justify-start animate-msg-in">
          <div className="rounded-md border border-line bg-panel/60 px-3.5 py-2.5">
            <TypingIndicator />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
