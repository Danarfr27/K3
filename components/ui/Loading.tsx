export default function Loading({ label = "LOADING" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-dim">
      <span className="status-dot" />
      <span className="neon-gradient-text">{label}</span>
      <span className="terminal-cursor" />
    </div>
  );
}
