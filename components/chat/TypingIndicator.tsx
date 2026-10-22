"use client";

export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-terminal/70">
        K3 processing
      </span>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1 w-1 rounded-full bg-terminal"
            style={{
              animation: `pulseDot 1.1s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </span>
    </div>
  );
}
