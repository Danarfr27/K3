"use client";

import type { Conversation } from "@/types/conversation";
import ConversationList from "./ConversationList";
import NewChatButton from "./NewChatButton";

interface Props {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}

export default function Sidebar({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
}: Props) {
  const body = (
    <div className="flex h-full flex-col">
      <div className="chat-sidebar-brand border-b border-line p-3">
        <NewChatButton onClick={onNew} />
      </div>

      <div className="neon-gradient-text px-3 pt-3 font-mono text-[9px] uppercase tracking-[0.35em]">
        HISTORY
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => {
            onSelect(id);
            onClose();
          }}
          onDelete={onDelete}
        />
      </div>

      <div className="chat-sidebar-footer border-t border-line p-3">
        <button
          onClick={onOpenSettings}
          className="neon-gradient-text flex w-full items-center justify-between rounded border border-line px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors hover:border-line-bright hover:text-white"
        >
          <span>SETTINGS</span>
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* desktop: fixed column */}
      <aside className="chat-sidebar hidden w-64 shrink-0 border-r border-line md:block">
        {body}
      </aside>

      {/* mobile: drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <aside className="chat-sidebar absolute inset-y-0 left-0 w-72 border-r border-line shadow-[0_0_40px_rgba(0,0,0,0.8)] animate-msg-in">
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
