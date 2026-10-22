"use client";

import type { GeneratedImage } from "@/types/chat";

export default function ImagePreview({ image }: { image: GeneratedImage }) {
  return (
    <figure className="k3-panel overflow-hidden rounded animate-msg-in">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.prompt}
        className="max-h-[420px] w-full object-contain bg-black"
        loading="lazy"
      />
      <figcaption className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <span className="min-w-0 truncate font-mono text-[10px] text-dim">{image.prompt}</span>
        <a
          href={image.url}
          download={`k3-${image.id}.png`}
          className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-terminal hover:underline"
        >
          [ download ]
        </a>
      </figcaption>
    </figure>
  );
}
