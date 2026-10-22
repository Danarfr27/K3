import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientKey } from "@/lib/utils/ratelimit";
import { checkFile, isValidId, LIMITS } from "@/lib/utils/validation";
import { saveUpload, getUploadMeta } from "@/lib/chat/uploads";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClientId(req: NextRequest): string {
  const header = req.headers.get("x-k3-client");
  return header && isValidId(header) ? header : "anonymous";
}

const TEXTUAL_MIME = /^text\/|application\/(json|javascript)|image\/svg\+xml/;

/**
 * POST /api/upload — multipart form upload.
 * Validates size / MIME / extension, extracts text for text files,
 * stores in-memory, returns file metadata.
 */
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);

  const rl = checkRateLimit(`upload:${clientKey(req)}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_MULTIPART" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "NO_FILE" }, { status: 400 });
  }

  const verdict = checkFile(file.name, file.size, file.type);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "FILE_UPLOAD_FAILED", reason: verdict.reason },
      { status: 422 }
    );
  }

  try {
    const id = `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    let textContent: string | undefined;
    if (TEXTUAL_MIME.test(file.type) || /\.(txt|md|markdown|csv|json|log|js|ts|tsx|jsx|py|html|css)$/i.test(file.name)) {
      textContent = (await file.text()).slice(0, 24_000);
    }
    saveUpload(clientId, {
      id,
      name: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
      textContent,
    });
    return NextResponse.json({
      id,
      name: file.name,
      size: file.size,
      mime: file.type,
      textExtracted: Boolean(textContent),
    });
  } catch (err) {
    logger.error("upload", "failed to store file", err);
    return NextResponse.json({ error: "FILE_UPLOAD_FAILED" }, { status: 500 });
  }
}

/** GET /api/upload?id=... → metadata for one upload (owner only). */
export async function GET(req: NextRequest) {
  const clientId = getClientId(req);
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !isValidId(id)) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }
  const meta = getUploadMeta(clientId, id);
  if (!meta) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(meta);
}
