"use client";

import { ReactNode, useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}

export default function Modal({ open, onClose, title, children, wide }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`k3-panel w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-lg shadow-[0_0_40px_rgba(0,255,156,0.07)] animate-msg-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-terminal">
            {title}
          </span>
          <button
            onClick={onClose}
            className="font-mono text-dim hover:text-white transition-colors text-sm leading-none"
            aria-label="Close"
          >
            [x]
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
