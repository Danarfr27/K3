"use client";

import { useRef, useState } from "react";
import type { UploadedFile } from "@/types/chat";

interface Props {
  clientId: string;
  files: UploadedFile[];
  onAdd: (file: UploadedFile) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  /** show the attach button (default true) */
  showButton?: boolean;
  /** show the file chips (default true) */
  showChips?: boolean;
}

const ACCEPT = ".txt,.md,.markdown,.csv,.json,.log,.pdf,.png,.jpg,.jpeg,.webp,.gif,.js,.ts,.tsx,.jsx,.py,.html,.css";
const MAX_BYTES = 5 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileUploader({
  clientId,
  files,
  onAdd,
  onRemove,
  disabled,
  showButton = true,
  showChips = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = () => inputRef.current?.click();

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(list).slice(0, 3)) {
        if (file.size > MAX_BYTES) {
          setError(`"${file.name}" exceeds 5 MB`);
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "x-k3-client": clientId },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.reason ?? "FILE UPLOAD FAILED");
          continue;
        }
        onAdd({
          id: data.id,
          name: data.name,
          size: data.size,
          mime: data.mime,
          textContent: data.textExtracted ? "(extracted)" : undefined,
        });
      }
    } catch {
      setError("FILE UPLOAD FAILED");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {showButton && (
        <button
          type="button"
          onClick={pick}
          disabled={disabled || busy}
          title="Attach file"
          aria-label="Attach file"
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line text-ghost transition-colors hover:border-line-bright hover:text-terminal disabled:opacity-40"
        >
          {busy ? (
            <span className="font-mono text-xs text-terminal animate-pulse">…</span>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          )}
        </button>
      )}

      {showChips && (files.length > 0 || error) && (
        <div className="mb-2 flex flex-col gap-1.5">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="k3-panel flex items-center gap-2 rounded px-2.5 py-1.5 animate-msg-in"
                >
                  <span className="text-terminal text-xs">▤</span>
                  <div className="leading-tight">
                    <div className="max-w-[160px] truncate font-mono text-[11px] text-ghost">{f.name}</div>
                    <div className="font-mono text-[9px] text-dim">{formatSize(f.size)}</div>
                  </div>
                  <button
                    onClick={() => onRemove(f.id)}
                    className="ml-1 font-mono text-xs text-dim transition-colors hover:text-red-400"
                    aria-label={`Remove ${f.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="font-mono text-[10px] uppercase tracking-wider text-red-400">
              {error}
            </div>
          )}
        </div>
      )}
    </>
  );
}
