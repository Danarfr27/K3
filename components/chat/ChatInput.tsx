"use client";

import { KeyboardEvent, useEffect, useRef } from "react";
import type { UploadedFile } from "@/types/chat";
import FileUploader from "./FileUploader";

interface Props {
  clientId: string;
  disabled: boolean;
  files: UploadedFile[];
  onAddFile: (f: UploadedFile) => void;
  onRemoveFile: (id: string) => void;
  onSend: (text: string) => void;
  value: string;
  onValueChange: (v: string) => void;
}

export default function ChatInput({
  clientId,
  disabled,
  files,
  onAddFile,
  onRemoveFile,
  onSend,
  value,
  onValueChange,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to ~6 lines.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 150) + "px";
  }, [value]);

  const canSend = value.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    onValueChange("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-line bg-panel/80">
      <div className="mx-auto w-full max-w-3xl px-3 pb-3 pt-2.5 sm:px-4">
        {/* attachment chips (button hidden — it lives in the input bar) */}
        <FileUploader
          clientId={clientId}
          files={files}
          onAdd={onAddFile}
          onRemove={onRemoveFile}
          disabled={disabled}
          showButton={false}
        />

        <div className="k3-panel flex items-end gap-2 rounded-lg px-3 py-2 transition-shadow focus-within:border-line-bright focus-within:shadow-[0_0_18px_rgba(0,255,156,0.08)]">
          <FileUploader
            clientId={clientId}
            files={files}
            onAdd={onAddFile}
            onRemove={onRemoveFile}
            disabled={disabled}
            showChips={false}
          />
          <span className="pb-2 select-none font-mono text-terminal/70">&gt;</span>
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask K3 anything..."
            disabled={disabled}
            maxLength={8000}
            className="max-h-[150px] flex-1 resize-none bg-transparent pb-1.5 pt-1 font-mono text-sm text-[#dff5e6] placeholder:text-dim/60 focus:outline-none disabled:opacity-50"
            aria-label="Message K3"
          />
          <button
            onClick={submit}
            disabled={!canSend}
            className="mb-0.5 flex h-9 shrink-0 items-center gap-1.5 rounded border border-terminal/40 bg-terminal/10 px-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-terminal transition-all hover:bg-terminal/20 hover:shadow-[0_0_16px_rgba(0,255,156,0.2)] disabled:opacity-30 disabled:hover:bg-terminal/10 disabled:hover:shadow-none"
          >
            SEND
            <span aria-hidden="true">↵</span>
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-dim/60">
          <span>enter to send · shift+enter newline</span>
          <span>{value.length} / 8000</span>
        </div>
      </div>
    </div>
  );
}
