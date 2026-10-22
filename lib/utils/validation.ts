/**
 * Input validation helpers shared by API routes.
 * Keep every limit conservative — this app targets serverless.
 */

export const LIMITS = {
  MAX_MESSAGE_CHARS: 8_000,
  MAX_MESSAGES_PER_REQUEST: 40,
  MAX_FILE_BYTES: 5 * 1024 * 1024, // 5 MB
  MAX_FILES_PER_MESSAGE: 3,
  MAX_IMAGE_PROMPT_CHARS: 1_000,
  MAX_TITLE_CHARS: 80,
} as const;

const ALLOWED_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const ALLOWED_EXT = new Set([
  ".txt", ".md", ".markdown", ".csv", ".json", ".log",
  ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif",
  ".js", ".ts", ".tsx", ".jsx", ".py", ".html", ".css",
]);

export function isNonEmptyString(v: unknown, max: number = LIMITS.MAX_MESSAGE_CHARS): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

export function isValidId(v: unknown): v is string {
  return typeof v === "string" && /^[a-zA-Z0-9_-]{4,64}$/.test(v);
}

export interface FileCheck {
  ok: boolean;
  reason?: string;
}

export function checkFile(name: string, size: number, mime: string): FileCheck {
  if (!isNonEmptyString(name, 255)) return { ok: false, reason: "Invalid file name" };
  if (size <= 0 || size > LIMITS.MAX_FILE_BYTES) {
    return { ok: false, reason: `File must be between 1 byte and ${LIMITS.MAX_FILE_BYTES / 1024 / 1024} MB` };
  }
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return { ok: false, reason: `Extension "${ext}" is not allowed` };
  if (mime && !ALLOWED_MIME.has(mime) && !mime.startsWith("text/")) {
    return { ok: false, reason: `MIME type "${mime}" is not allowed` };
  }
  return { ok: true };
}

export function sanitizeTitle(raw: string): string {
  return raw.replace(/[\r\n]+/g, " ").trim().slice(0, LIMITS.MAX_TITLE_CHARS) || "Untitled session";
}
