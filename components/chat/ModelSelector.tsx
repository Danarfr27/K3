"use client";

import { useEffect, useRef, useState } from "react";
import type { AIModel } from "@/types/model";

interface Props {
  models: AIModel[];
  value: string;
  onChange: (id: string) => void;
}

export default function ModelSelector({ models, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = models.find((m) => m.id === value) ?? models[0];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!active) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded border border-line bg-panel px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ghost transition-colors hover:border-line-bright hover:text-white"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-dim">MODEL:</span>
        <span className="text-terminal">{active.name}</span>
        <span className={`text-dim transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div
          className="k3-panel absolute right-0 top-full z-40 mt-1 w-72 rounded-md py-1 shadow-[0_8px_30px_rgba(0,0,0,0.6)] animate-msg-in"
          role="listbox"
        >
          {models.map((m) => (
            <button
              key={m.id}
              role="option"
              aria-selected={m.id === value}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left transition-colors hover:bg-white/[0.04] ${
                m.id === value ? "bg-terminal/[0.06]" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-mono text-xs tracking-wider ${m.id === value ? "text-terminal" : "text-ghost"}`}>
                  {m.name}
                </span>
                {m.id === value && <span className="font-mono text-[10px] text-terminal">●</span>}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-dim">{m.description}</p>
              <p className="mt-0.5 font-mono text-[10px] text-dim/70">
                ctx {(m.contextWindow / 1000).toFixed(0)}k
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
