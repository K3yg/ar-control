import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { checkKey, isAuthorized, sessionCookieOptions, SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { env, ST_OAUTH, ST_SCOPES } from "@/lib/env";

export async function GET(req: Request) {
  const keyParam = new URL(req.url).searchParams.get("key");
  const viaKey = checkKey(keyParam);
  if (!viaKey && !isAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const state = randomBytes(24).toString("base64url");
  const url = new URL(`${ST_OAUTH}/authorize`);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", env.redirectUri);
  url.searchParams.set("scope", ST_SCOPES);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("st_oauth_state", state, { ...sessionCookieOptions, maxAge: 600 });
  if (viaKey) res.cookies.set(SESSION_COOKIE, sessionToken(), sessionCookieOptions);
  return res;
}
