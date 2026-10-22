import { NextRequest, NextResponse } from "next/server";
import {
  areValidCredentials,
  AUTH_COOKIE,
  createSessionValue,
  hasConfiguredCredentials,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { username?: unknown; password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!hasConfiguredCredentials() && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "AUTH_NOT_CONFIGURED",
        message:
          "USER1_USER/USER1_PASS belum terbaca oleh deployment Vercel. Periksa Environment scope lalu redeploy.",
      },
      { status: 503 }
    );
  }

  if (!areValidCredentials(username, password)) {
    return NextResponse.json(
      { error: "INVALID_CREDENTIALS" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    redirectTo: "/splash.html?next=/chat",
  });
  response.cookies.set(AUTH_COOKIE, createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });
  return response;
}
