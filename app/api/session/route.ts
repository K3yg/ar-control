import { NextResponse } from "next/server";
import { checkKey, isAuthorized, sessionCookieOptions, SESSION_COOKIE, sessionToken } from "@/lib/auth";

export async function GET(req: Request) {
  return Response.json({ authorized: isAuthorized(req) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { key?: string };
  if (!checkKey(body.key)) {
    await new Promise((r) => setTimeout(r, 400));
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken(), sessionCookieOptions);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
