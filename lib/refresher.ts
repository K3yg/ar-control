import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { patInfo, savePat } from "./pat";
import { redis } from "./redis";

/**
 * Keepalive for the refresher session, run by QStash every 20 minutes (no browser needed).
 * The SmartThings account session is a short JWT (~2h) that the site renews by bouncing through
 * the Samsung login with the session cookies. Hitting it often keeps that chain alive; when the
 * PAT is getting old it also creates a new one. Needs SESSION_KEY (same as the robot's).
 * The GitHub Actions robot (refresher/) stays as the fallback and for the first login.
 */

export const SESSION_KEY_NAME = "refresher:session";
const STATUS_KEY = "refresher:status";
const TOKENS_PAGE = "https://account.smartthings.com/tokens";
const TOKENS_API = "https://account.smartthings.com/api/tokens";
const SCOPES = (process.env.PAT_SCOPES || "l:devices,r:devices:*,w:devices:*,x:devices:*").split(",").map((s) => s.trim());
const NEW_PAT_AFTER = 18 * 3600 * 1000;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

type Cookie = { name: string; value: string; domain: string; path: string; expires: number; httpOnly?: boolean; secure?: boolean; sameSite?: string };
type StorageState = { cookies: Cookie[]; origins: unknown[] };
export type RefresherStatus = { at: number; ok: boolean; message: string; okSince?: number; lastOk?: number; patAt?: number };

function key() {
  const raw = process.env.SESSION_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  return k?.length === 32 ? k : null;
}

function decrypt(blob: string, k: Buffer): StorageState {
  const buf = Buffer.from(blob, "base64");
  const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"));
}

function encrypt(obj: unknown, k: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}

/** Minimal cookie jar over Playwright's storageState: domain/path matching and Set-Cookie updates. */
class Jar {
  constructor(public cookies: Cookie[]) {}

  header(url: URL) {
    const now = Date.now() / 1000;
    return this.cookies
      .filter((c) => {
        const d = c.domain.replace(/^\./, "");
        const domainOk = url.hostname === d || (c.domain.startsWith(".") && url.hostname.endsWith(`.${d}`));
        return domainOk && url.pathname.startsWith(c.path || "/") && (c.expires < 0 || c.expires > now);
      })
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  store(url: URL, setCookies: string[]) {
    for (const line of setCookies) {
      const [pair, ...attrs] = line.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const a = Object.fromEntries(attrs.map((s) => { const i = s.indexOf("="); return i < 0 ? [s.toLowerCase(), ""] : [s.slice(0, i).toLowerCase(), s.slice(i + 1)]; }));
      const domain = a.domain ? `.${a.domain.replace(/^\./, "")}` : url.hostname;
      const path = a.path || "/";
      let expires = -1;
      if (a["max-age"] !== undefined) expires = Date.now() / 1000 + Number(a["max-age"]);
      else if (a.expires) expires = Date.parse(a.expires) / 1000;
      this.cookies = this.cookies.filter((c) => !(c.name === name && c.domain === domain && (c.path || "/") === path));
      if (expires < 0 || expires > Date.now() / 1000)
        this.cookies.push({ name, value, domain, path, expires, httpOnly: "httponly" in a, secure: "secure" in a, sameSite: "Lax" });
    }
  }

  get(name: string) {
    return this.cookies.find((c) => c.name === name)?.value;
  }

  /** fetch that follows redirects by hand so cookies set on every hop are kept. */
  async fetch(input: string, init: RequestInit = {}, hops = 12): Promise<{ res: Response; url: URL }> {
    let url = new URL(input);
    let method = init.method || "GET";
    let body = init.body;
    for (let i = 0; i <= hops; i++) {
      const headers = new Headers(init.headers);
      headers.set("user-agent", UA);
      headers.set("accept-language", "en-US,en;q=0.9");
      const cookie = this.header(url);
      if (cookie) headers.set("cookie", cookie);
      const res = await fetch(url, { method, body, headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10000) });
      this.store(url, res.headers.getSetCookie());
      const loc = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !loc) return { res, url };
      url = new URL(loc, url);
      if (res.status !== 307 && res.status !== 308) {
        method = "GET";
        body = undefined;
      }
    }
    throw new Error("Too many redirects");
  }
}

async function setStatus(ok: boolean, message: string, extra: Partial<RefresherStatus> = {}) {
  const prev = await refresherStatus();
  const now = Date.now();
  const s: RefresherStatus = {
    ...prev,
    ...extra,
    at: now,
    ok,
    message,
    lastOk: ok ? now : prev?.lastOk,
    okSince: ok ? (prev?.ok ? prev.okSince ?? now : now) : undefined,
  };
  await redis().set(STATUS_KEY, s);
  return s;
}

export async function refresherStatus() {
  return (await redis().get<RefresherStatus>(STATUS_KEY)) ?? null;
}

/** One keepalive tick. force = create a new PAT even if the current one is fresh. */
export async function tick({ force = false } = {}) {
  const k = key();
  if (!k) return setStatus(false, "SESSION_KEY is not set on the app");
  const blob = await redis().get<string>(SESSION_KEY_NAME);
  if (!blob) return setStatus(false, "No saved session. Run `npm run login` in refresher/.");

  const state = decrypt(blob, k);
  const jar = new Jar(state.cookies);

  // The page itself runs the renew chain (smartthings → samsung → back) when the JWT is old.
  await jar.fetch(TOKENS_PAGE, { headers: { accept: "text/html" } });
  const list = await jar.fetch(TOKENS_API, { headers: { accept: "application/json", referer: TOKENS_PAGE } });
  const alive = list.res.status === 200 && list.url.hostname === "account.smartthings.com" && (list.res.headers.get("content-type") ?? "").includes("json");
  if (!alive) return setStatus(false, `Session expired (${list.res.status} at ${list.url.hostname}). Run \`npm run login\` in refresher/.`);

  const pat = await patInfo();
  let patAt: number | undefined;
  if (force || !pat || Date.now() - pat.savedAt > NEW_PAT_AFTER || (await redis().get("st:needsReauth"))) {
    const name = `refresher-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
    const created = await jar.fetch(TOKENS_API, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-xsrf-token": decodeURIComponent(jar.get("XSRF-TOKEN") ?? ""),
        origin: "https://account.smartthings.com",
        referer: TOKENS_PAGE,
      },
      body: JSON.stringify({ deviceId: randomUUID(), deviceName: name, scope: SCOPES }),
    });
    const text = await created.res.text();
    const token = extractToken(text);
    if (!created.res.ok || !token) {
      await saveJar(state, jar, k);
      return setStatus(false, `Session alive, but token creation failed (HTTP ${created.res.status})`);
    }
    await savePat(token);
    patAt = Date.now();
  }

  await saveJar(state, jar, k);
  return setStatus(true, patAt ? "Session alive, new token created" : "Session alive", patAt ? { patAt } : {});
}

async function saveJar(state: StorageState, jar: Jar, k: Buffer) {
  await redis().set(SESSION_KEY_NAME, encrypt({ ...state, cookies: jar.cookies }, k));
}

/** Same lookup as refresher/lib.mjs: known field names, else the UUID that isn't an id. */
function extractToken(text: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const o = data as Record<string, unknown> & { token?: Record<string, unknown> };
  for (const f of ["accessToken", "access_token", "token", "authToken", "value"]) {
    if (typeof o?.[f] === "string") return o[f] as string;
    if (typeof o?.token?.[f] === "string") return o.token[f] as string;
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const found: string[] = [];
  const walk = (v: unknown, k?: string) => {
    if (typeof v === "string" && uuid.test(v) && !/device|client|id$/i.test(k ?? "")) found.push(v);
    else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
  };
  walk(data);
  return found[0] ?? null;
}
