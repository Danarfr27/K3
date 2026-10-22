import type { UploadedFile } from "@/types/chat";

/**
 * Upload store — in-memory, scoped per client.
 * Holds extracted text so /api/chat can inject it into context.
 * Swap for object storage (S3 / Vercel Blob) in production.
 */

interface StoredUpload extends UploadedFile {
  clientId: string;
  storedAt: number;
}

const uploads = new Map<string, StoredUpload>();

const MAX_UPLOADS = 100;
const TTL_MS = 30 * 60 * 1000; // 30 minutes

function sweep(): void {
  const now = Date.now();
  uploads.forEach((up, id) => {
    if (now - up.storedAt > TTL_MS) uploads.delete(id);
  });
}

export function saveUpload(clientId: string, file: UploadedFile): void {
  if (uploads.size >= MAX_UPLOADS) sweep();
  uploads.set(file.id, { ...file, clientId, storedAt: Date.now() });
}

export function getUploadText(
  clientId: string,
  id: string
): { name: string; text: string } | null {
  const up = uploads.get(id);
  if (!up || up.clientId !== clientId || !up.textContent) return null;
  return { name: up.name, text: up.textContent };
}

export function getUploadMeta(clientId: string, id: string): UploadedFile | null {
  const up = uploads.get(id);
  if (!up || up.clientId !== clientId) return null;
  const { id: fid, name, size, mime, textContent } = up;
  return { id: fid, name, size, mime, textContent };
}
