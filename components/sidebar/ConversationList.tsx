"use client";

import type { Conversation } from "@/types/conversation";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function groupLabel(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return "Earlier";
}

export default function ConversationList({ conversations, activeId, onSelect, onDelete }: Props) {
  if (conversations.length === 0) {
    return (
      <div className="px-3 py-6 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-dim/60">
        no sessions logged
      </div>
    );
  }

  // group by Today / Yesterday / Earlier
  const groups: { label: string; items: Conversation[] }[] = [];
  for (const c of conversations) {
    const label = groupLabel(c.updatedAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(c);
    else groups.push({ label, items: [c] });
  }

  return (
    <div className="flex flex-col gap-4 px-2 py-2">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-1.5 pb-1.5 font-mono text-[9px] uppercase tracking-[0.3em] text-dim/70">
            {g.label}
          </div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((c) => {
              const active = c.id === activeId;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center rounded border transition-colors ${
                    active
                      ? "border-terminal/40 bg-terminal/[0.07]"
                      : "border-transparent hover:border-line hover:bg-white/[0.03]"
                  }`}
                >
                  <button
                    onClick={() => onSelect(c.id)}
                    className="min-w-0 flex-1 px-2.5 py-2 text-left"
                    title={c.title}
                  >
                    <div
                      className={`truncate font-mono text-[11px] ${
                        active ? "text-terminal" : "text-ghost"
                      }`}
                    >
                      {active ? "▸ " : "▹ "}
                      {c.title}
                    </div>
                    {c.preview && (
                      <div className="mt-0.5 truncate text-[10px] text-dim/70">{c.preview}</div>
                    )}
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    className="mr-1.5 hidden rounded px-1 font-mono text-xs text-dim transition-colors hover:text-red-400 group-hover:block"
                    aria-label={`Delete ${c.title}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
