"use client";

import { useState } from "react";
import type { GeneratedImage } from "@/types/chat";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import ImagePreview from "./ImagePreview";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ImageGenerator({ open, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<GeneratedImage | null>(null);

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setImage(null);
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "RATE_LIMITED" ? `RATE LIMITED — retry in ${data.retryAfterSec}s` : "IMAGE GENERATION FAILED");
        return;
      }
      setImage({
        id: `img_${Date.now().toString(36)}`,
        prompt: prompt.trim(),
        url: data.url,
        model: data.model,
        createdAt: Date.now(),
      });
    } catch {
      setError("IMAGE GENERATION FAILED");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="GENERATE IMAGE" wide>
      <div className="flex flex-col gap-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Describe image... e.g. a lone hacker terminal glowing in a dark server room, cinematic"
          className="w-full resize-none rounded border border-line bg-void p-3 font-mono text-sm text-[#dff5e6] placeholder:text-dim/50 focus:border-line-bright focus:outline-none"
        />

        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            Model: [ image-synth-v1 ]
          </span>
          <Button variant="primary" onClick={() => void generate()} disabled={!prompt.trim() || busy}>
            {busy ? "SYNTHESIZING…" : "GENERATE"}
          </Button>
        </div>

        {busy && (
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-terminal/70">
            <span className="status-dot" /> rendering pixels
            <span className="terminal-cursor" />
          </div>
        )}

        {error && (
          <div className="rounded border border-red-900/50 bg-red-950/30 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-red-400">
            {error}
          </div>
        )}

        {image && <ImagePreview image={image} />}
      </div>
    </Modal>
  );
}
