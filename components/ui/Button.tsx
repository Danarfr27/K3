"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "ghost" | "danger" | "outline";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
}

const styles: Record<Variant, string> = {
  primary:
    "bg-terminal/10 text-terminal border border-terminal/40 hover:bg-terminal/20 hover:border-terminal/70 hover:shadow-[0_0_14px_rgba(0,255,156,0.18)]",
  ghost:
    "text-ghost border border-transparent hover:text-white hover:border-line-bright hover:bg-white/[0.03]",
  outline:
    "text-ghost border border-line hover:border-line-bright hover:text-white hover:bg-white/[0.03]",
  danger:
    "text-red-400 border border-red-900/50 hover:bg-red-950/40 hover:border-red-700/60",
};

const sizes = {
  sm: "px-2.5 py-1 text-[11px]",
  md: "px-3.5 py-1.5 text-xs",
};

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "outline", size = "md", className = "", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded font-mono uppercase tracking-wider transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none ${styles[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});

export default Button;
