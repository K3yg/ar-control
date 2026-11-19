import { randomUUID } from "node:crypto";
import { env, ST_OAUTH } from "./env";
import { AcError } from "./errors";
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

/** Só para teste local: token pessoal do SmartThings (expira em 24h). Ignorado em produção. */
const devPat = process.env.NODE_ENV !== "production" ? process.env.ST_PAT : undefined;

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
  // As fontes divergem sobre o caminho; tenta o alternativo em 404.
  if (res.status === 404) res = await fetch("https://api.smartthings.com/v1/oauth/token", init());
  if (!res.ok) {
    // Só o campo de erro, nunca o corpo inteiro (pode conter tokens).
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
  // Access + refresh numa única chave: gravação atômica do par.
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

/** Motivo pelo qual é preciso reconectar, ou null se está tudo certo. */
export async function needsReauth(): Promise<string | null> {
  if (devPat) return null;
  const flag = await redis().get<string>(REAUTH);
  if (flag) return flag;
  return (await readTokens()) ? null : "Nenhum login feito";
}

async function releaseLock(id: string) {
  await redis().eval(
    `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
    [LOCK],
    [id],
  );
}

/** Renova com lock. `since` = refreshedAt visto; se alguém já renovou depois, usa o par novo. */
async function refresh(since: number): Promise<Tokens> {
  const id = randomUUID();
  for (let attempt = 0; attempt < 25; attempt++) {
    const got = await redis().set(LOCK, id, { nx: true, px: 10000 });
    if (got) {
      try {
        const current = await readTokens();
        if (!current) throw new AcError("needs_reauth", "Nenhum login feito", 401);
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
            const msg = `Refresh rejeitado (${e.message}). Reconecte o SmartThings.`;
            await redis().set(REAUTH, msg);
            console.error("[tokens]", msg);
            throw new AcError("needs_reauth", msg, 401);
          }
          console.error("[tokens] falha no refresh:", e instanceof Error ? e.message : e);
          throw new AcError("smartthings", "Falha ao renovar token", 502);
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
  throw new AcError("smartthings", "Timeout aguardando renovação do token", 503);
}

export async function getValidAccessToken(): Promise<string> {
  if (devPat) return devPat;
  const t = await readTokens();
  if (!t) throw new AcError("needs_reauth", "Nenhum login feito", 401);
  const life = t.expiresAt - t.refreshedAt;
  if (t.expiresAt - Date.now() < life * 0.25) return (await refresh(t.refreshedAt)).accessToken;
  return t.accessToken;
}

export async function forceRefresh(): Promise<Tokens> {
  if (devPat) throw new AcError("needs_reauth", "ST_PAT inválido ou expirado (dura 24h)", 401);
  const t = await readTokens();
  if (!t) throw new AcError("needs_reauth", "Nenhum login feito", 401);
  return refresh(t.refreshedAt);
}
