import { randomUUID } from "node:crypto";
import { env, ST_OAUTH } from "./env";
import { AcError } from "./errors";
import { invalidatePat, readPat } from "./pat";
import { redis } from "./redis";

const KEY = "st:tokens";
const LOCK = "st:lock";
const REAUTH = "st:needsReauth";

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  refreshedAt: number; // epoch ms
};

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

class TokenHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const sleep =(ms: number) => new Promise((r) => setTimeout(r, ms));

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
  const init = (): RequestInit => ({
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  let res = await fetch(`${ST_OAUTH}/token`, init());
  // Sources disagree on the path; try the other one on 404.
  if (res.status === 404) res = await fetch("https://api.smartthings.com/v1/oauth/token", init());
  if (!res.ok) {
    // Only the error field, never the whole body (it may contain tokens).
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new TokenHttpError(res.status, `token endpoint ${res.status} ${data.error ?? ""}`.trim());
  }
  return res.json();
}

function toTokens(t: TokenResponse): Tokens {
  const now = Date.now();
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: now + t.expires_in * 1000,
    refreshedAt: now,
  };
}

export async function readTokens(): Promise<Tokens | null> {
  return (await redis().get<Tokens>(KEY)) ?? null;
}

async function saveTokens(t: Tokens) {
  // Access + refresh in a single key: the pair is written atomically.
  await redis().set(KEY, t);
  await redis().del(REAUTH);
}

export async function exchangeCode(code: string) {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.redirectUri,
    client_id: env.clientId,
  });
  await saveTokens(toTokens(t));
}

/** Why a reconnect is needed, or null when all is fine. */
export async function needsReauth(): Promise<string | null> {
  if (await readPat()) return null;
  const flag = await redis().get<string>(REAUTH);
  if (flag) return flag;
  return (await readTokens()) ? null : "Not connected yet";
}

async function releaseLock(id: string) {
  await redis().eval(
    `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
    [LOCK],
    [id],
  );
}

/** Refreshes under a lock. `since` = refreshedAt we saw; if someone refreshed after it, reuse their pair. */
async function refresh(since: number): Promise<Tokens> {
  const id = randomUUID();
  for (let attempt = 0; attempt < 25; attempt++) {
    const got = await redis().set(LOCK, id, { nx: true, px: 10000 });
    if (got) {
      try {
        const current = await readTokens();
        if (!current) throw new AcError("needs_reauth", "Not connected yet", 401);
        if (current.refreshedAt > since) return current;
        let t: TokenResponse;
        try {
          t = await tokenRequest({
            grant_type: "refresh_token",
            refresh_token: current.refreshToken,
            client_id: env.clientId,
          });
        } catch (e) {
          if (e instanceof TokenHttpError && (e.status === 400 || e.status === 401)) {
            const msg = `Refresh rejected (${e.message}). Connect SmartThings again.`;
            await redis().set(REAUTH, msg);
            console.error("[tokens]", msg);
            throw new AcError("needs_reauth", msg, 401);
          }
          console.error("[tokens] falha no refresh:", e instanceof Error ? e.message : e);
          throw new AcError("smartthings", "Couldn't refresh the token", 502);
        }
        const next = toTokens(t);
        await saveTokens(next);
        return next;
      } finally {
        await releaseLock(id);
      }
    }
    await sleep(500);
    const t = await readTokens();
    if (t && t.refreshedAt > since) return t;
  }
  throw new AcError("smartthings", "Timed out waiting for the token refresh", 503);
}

export async function getValidAccessToken(): Promise<string> {
  const pat = await readPat();
  if (pat) return pat;
  const t = await readTokens();
  if (!t) throw new AcError("needs_reauth", "Not connected yet", 401);
  const life = t.expiresAt - t.refreshedAt;
  if (t.expiresAt - Date.now() < life * 0.25) return (await refresh(t.refreshedAt)).accessToken;
  return t.accessToken;
}

export async function forceRefresh(): Promise<Tokens> {
  if (await readPat()) {
    // A PAT can't be refreshed: drop it and ask for a new one.
    await invalidatePat();
    await redis().set(REAUTH, "The SmartThings token expired. Paste a new one.");
    throw new AcError("needs_reauth", "The SmartThings token expired. Paste a new one.", 401);
  }
  const t = await readTokens();
  if (!t) throw new AcError("needs_reauth", "Not connected yet", 401);
  return refresh(t.refreshedAt);
}
