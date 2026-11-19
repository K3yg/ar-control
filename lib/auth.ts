import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const SESSION_COOKIE = "ac_session";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** Valor do cookie de sessão: derivado do segredo, sem guardar o segredo em si. */
export function sessionToken(): string {
  return createHmac("sha256", env.apiKey).update("ac-session-v1").digest("base64url");
}

export function checkKey(key: string | null | undefined): boolean {
  return !!key && safeEqual(key, env.apiKey);
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
}

export function isAuthorized(req: Request): boolean {
  const header = req.headers.get("x-ac-key");
  if (header && checkKey(header)) return true;
  const cookie = readCookie(req, SESSION_COOKIE);
  return !!cookie && safeEqual(cookie, sessionToken());
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function isCronAuthorized(req: Request): boolean {
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${env.cronSecret}`);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
};
