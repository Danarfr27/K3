import { NextRequest, NextResponse } from "next/server";
import {
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
} from "@/lib/chat/conversations";
import { isValidId } from "@/lib/utils/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClientId(req: NextRequest): string {
  const header = req.headers.get("x-k3-client");
  return header && isValidId(header) ? header : "anonymous";
}

/**
 * GET /api/conversations           → list sessions
 * GET /api/conversations?id=...    → one session with messages
 */
export async function GET(req: NextRequest) {
  const clientId = getClientId(req);
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    if (!isValidId(id)) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
    const convo = getConversation(clientId, id);
    if (!convo) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json(convo);
  }
  return NextResponse.json({ conversations: listConversations(clientId) });
}

/** POST /api/conversations — body: { title? } */
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  let title = "New session";
  try {
    const body = (await req.json()) as { title?: string };
    if (typeof body.title === "string" && body.title.trim()) title = body.title;
  } catch {
    // empty body is fine
  }
  return NextResponse.json(createConversation(clientId, title), { status: 201 });
}

/** DELETE /api/conversations?id=... */
export async function DELETE(req: NextRequest) {
  const clientId = getClientId(req);
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !isValidId(id)) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }
  const removed = deleteConversation(clientId, id);
  if (!removed) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
