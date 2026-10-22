"use client";

import type { AIModel } from "@/types/model";
import ModelSelector from "./ModelSelector";

interface Props {
  models: AIModel[];
  model: string;
  onModelChange: (id: string) => void;
  online: boolean;
  onToggleSidebar: () => void;
  onOpenImageGen: () => void;
  onOpenSettings: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onLogout: () => void;
}

export default function ChatHeader({
  models,
  model,
  onModelChange,
  online,
  onToggleSidebar,
  onOpenImageGen,
  onOpenSettings,
  theme,
  onToggleTheme,
  onLogout,
}: Props) {
  return (
    <header className="flex h-13 items-center justify-between gap-2 border-b border-line bg-panel/70 px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <a
          href="https://wormgemma.vercel.app/index.html"
          className="flex h-8 w-8 items-center justify-center rounded border border-line text-lg text-ghost transition-colors hover:border-line-bright hover:text-terminal"
          aria-label="Back to Worm Gemma"
          title="Back to Worm Gemma"
        >
          ←
        </a>
        <button
          onClick={onToggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded border border-line text-ghost transition-colors hover:border-line-bright hover:text-terminal md:hidden"
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-bold tracking-[0.3em] text-white">
            K3<span className="text-terminal">FIRDHAN_AI</span>
          </span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.3em] text-dim sm:inline">
            cyber intelligence assistant
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onOpenImageGen}
          className="hidden items-center gap-1.5 rounded border border-line px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ghost transition-colors hover:border-cyber/50 hover:text-cyber sm:flex"
          title="Generate image"
        >
          <span aria-hidden="true">◈</span> IMAGE
        </button>

        <ModelSelector models={models} value={model} onChange={onModelChange} />

        <button
          onClick={onOpenSettings}
          className="flex h-8 w-8 items-center justify-center rounded border border-line text-ghost transition-colors hover:border-line-bright hover:text-white"
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>

        <button
          onClick={onToggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded border border-line text-ghost transition-colors hover:border-cyber/50 hover:text-cyber"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? "☼" : "☾"}
        </button>

        <button
          onClick={onLogout}
          className="flex h-8 w-8 items-center justify-center rounded border border-line font-mono text-[11px] uppercase tracking-wider text-ghost transition-colors hover:border-red-400/60 hover:text-red-300 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5"
          title="Logout"
          aria-label="Logout"
        >
          <span aria-hidden="true">↪</span><span className="hidden sm:inline">LOGOUT</span>
        </button>

        <div className="hidden items-center gap-1.5 rounded border border-line px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] sm:flex">
          <span className={online ? "status-dot" : "h-[7px] w-[7px] rounded-full bg-red-500"} />
          <span className={online ? "text-terminal" : "text-red-400"}>
            {online ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>
    </header>
  );
}
