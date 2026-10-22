type LogLevel = "info" | "warn" | "error";

function stamp(): string {
  return new Date().toISOString();
}

/**
 * Minimal server-side logger.
 * Never log secrets, API keys, or full user payloads here.
 */
export const logger = {
  info(scope: string, message: string) {
    console.log(`[${stamp()}] [INFO] [${scope}] ${message}`);
  },
  warn(scope: string, message: string) {
    console.warn(`[${stamp()}] [WARN] [${scope}] ${message}`);
  },
  error(scope: string, message: string, err?: unknown) {
    const detail = err instanceof Error ? err.message : String(err ?? "");
    console.error(`[${stamp()}] [ERROR] [${scope}] ${message}${detail ? ` :: ${detail}` : ""}`);
  },
};
