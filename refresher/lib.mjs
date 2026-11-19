// Utilitários compartilhados entre login.mjs e refresh.mjs.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const TOKENS_URL = "https://account.smartthings.com/tokens";
export const DEFAULT_SCOPES = ["l:devices", "r:devices:*", "w:devices:*", "x:devices:*"];

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável ausente: ${name} (veja refresher/README.md)`);
    process.exit(2);
  }
  return v;
}

/**
 * Configuração 100% por variável de ambiente.
 *  APP_URL           base do app que recebe o token (ex.: https://meu-app.vercel.app)
 *  APP_KEY           segredo enviado no header x-ac-key
 *  SESSION_KEY       chave AES-256 (base64, 32 bytes) que criptografa a sessão; só o robô conhece
 *  PAT_TARGET_URL    opcional, padrão: APP_URL/api/pat
 *  SESSION_STORE_URL opcional, padrão: APP_URL/api/refresher/session
 *  PAT_SCOPES        opcional, separados por vírgula
 *  PAT_NAME_PREFIX   opcional, padrão "robo"
 */
export function config() {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const patTarget = process.env.PAT_TARGET_URL || (appUrl && `${appUrl}/api/pat`);
  const sessionStore = process.env.SESSION_STORE_URL || (appUrl && `${appUrl}/api/refresher/session`);
  if (!patTarget || !sessionStore) required("APP_URL");
  const key = Buffer.from(required("SESSION_KEY"), "base64");
  if (key.length !== 32) {
    console.error("SESSION_KEY precisa ter 32 bytes em base64 (gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")");
    process.exit(2);
  }
  return {
    patTarget,
    sessionStore,
    appKey: required("APP_KEY"),
    key,
    scopes: process.env.PAT_SCOPES ? process.env.PAT_SCOPES.split(",").map((s) => s.trim()) : DEFAULT_SCOPES,
    namePrefix: process.env.PAT_NAME_PREFIX || "robo",
  };
}

export function encrypt(obj, key) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}

export function decrypt(blob, key) {
  const buf = Buffer.from(blob, "base64");
  const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"));
}

async function call(url, appKey, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "x-ac-key": appKey, "content-type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method || "GET"} ${url} → ${res.status} ${data.message || data.error || ""}`.trim());
  return data;
}

export async function loadSession(cfg) {
  const { blob } = await call(cfg.sessionStore, cfg.appKey);
  return blob ? decrypt(blob, cfg.key) : null;
}

export async function saveSession(cfg, storageState) {
  await call(cfg.sessionStore, cfg.appKey, { method: "PUT", body: JSON.stringify({ blob: encrypt(storageState, cfg.key) }) });
}

export async function deliverPat(cfg, token) {
  await call(cfg.patTarget, cfg.appKey, { method: "POST", body: JSON.stringify({ token }) });
}

/** Cria um PAT pela API interna da página de tokens, usando a sessão do navegador. */
export async function createPat(page, { scopes, name }) {
  return page.evaluate(
    async ({ scopes, name }) => {
      const xsrf = decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || "");
      const res = await fetch("/api/tokens", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json", "x-xsrf-token": xsrf },
        body: JSON.stringify({ deviceId: crypto.randomUUID(), deviceName: name, scope: scopes }),
      });
      const text = await res.text();
      return { status: res.status, text };
    },
    { scopes, name },
  );
}

/** Acha o token na resposta sem depender do nome exato do campo. */
export function extractToken(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const k of ["accessToken", "access_token", "token", "authToken", "value"]) {
    if (typeof data?.[k] === "string") return data[k];
    if (typeof data?.token?.[k] === "string") return data.token[k];
  }
  // fallback: único UUID que não seja id de aparelho/cliente
  const found = [];
  const walk = (o, key) => {
    if (typeof o === "string" && uuid.test(o) && !/device|client|id$/i.test(key || "")) found.push(o);
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, k);
  };
  walk(data);
  return found[0] ?? null;
}

/** Lista os campos da resposta com valores mascarados, para depuração. */
export function describe(text) {
  return text.replace(/[A-Za-z0-9-_]{16,}/g, (m) => `<${m.length}ch>`).slice(0, 400);
}
