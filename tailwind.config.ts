import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "var(--bg)",
        panel: "var(--panel)",
        elevated: "var(--elevated)",
        line: "var(--line)",
        "line-bright": "var(--line-bright)",
        terminal: "var(--terminal)",
        cyber: "var(--cyber)",
        dim: "var(--dim)",
        ghost: "var(--ghost)",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      animation: {
        blink: "blink 1.06s step-end infinite",
        "pulse-dot": "pulseDot 2s ease-in-out infinite",
        scan: "scan 9s linear infinite",
        "msg-in": "msgIn 0.25s ease-out both",
        "glow-line": "glowLine 3s ease-in-out infinite",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(0,255,156,0.45)" },
          "50%": { opacity: "0.75", boxShadow: "0 0 0 5px rgba(0,255,156,0)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        msgIn: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glowLine: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.9" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
