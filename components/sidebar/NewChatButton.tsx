"use client";

interface Props {
  onClick: () => void;
  compact?: boolean;
}

export default function NewChatButton({ onClick, compact }: Props) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded border border-terminal/40 bg-terminal/[0.07] px-3 py-2 font-mono text-[15px] uppercase tracking-[0.2em] text-terminal transition-all hover:bg-terminal/15 hover:shadow-[0_0_14px_rgba(0,255,156,0.15)] ${
        compact ? "justify-center" : ""
      }`}
    >
      <span className="text-[20px] leading-none">+</span>
      {!compact && <span>NEW CHAT</span>}
    </button>
  );
}
