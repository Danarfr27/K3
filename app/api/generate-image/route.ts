import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/image/generator";
import { checkRateLimit, clientKey } from "@/lib/utils/ratelimit";
import { isNonEmptyString, LIMITS } from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/generate-image
 * Body: { prompt }
 * Response: { url, model } — url is a data URI or remote URL.
 * Provider credentials stay server-side.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(`img:${clientKey(req)}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  if (!isNonEmptyString(body.prompt, LIMITS.MAX_IMAGE_PROMPT_CHARS)) {
    return NextResponse.json({ error: "INVALID_PROMPT" }, { status: 400 });
  }

  try {
    const result = await generateImage(body.prompt.trim());
    return NextResponse.json(result);
  } catch (err) {
    logger.error("image", "generation failed", err);
    return NextResponse.json({ error: "IMAGE_GENERATION_FAILED" }, { status: 502 });
  }
}
