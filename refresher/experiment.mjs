// Experiment: does going through the login again (before the ~2h JWT expires) renew the session?
// Sign in once in the window; it creates a token, then every 10 min re-runs the login flow and
// logs the session's expiry. If the expiry keeps moving forward, the session can live forever.
import { appendFileSync } from "node:fs";
import { chromium } from "playwright";
import { TOKENS_URL, config, createPat, deliverPat, extractToken, loadSession, saveSession } from "./lib.mjs";
// CI=1: no window, start from the saved session and stop after ROUNDS rounds.
const CI = !!process.env.CI;
const ROUNDS = Number(process.env.ROUNDS || 1e9);

const cfg = config();
const LOG = "experiment.log";
const log = (m) => {
  const line = `${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })} ${m}`;
  console.log(line);
  appendFileSync(LOG, line + "\n");
};

const browser = await chromium.launch({ headless: CI });
const context = await browser.newContext(CI ? { storageState: await loadSession(cfg) } : { viewport: { width: 1100, height: 850 } });
const page = await context.newPage();

const jwtExp = async () => {
  const c = (await context.cookies("https://account.smartthings.com")).find((c) => c.name === "_JTKN");
  if (!c) return "none";
  const exp = JSON.parse(Buffer.from(c.value.split(".")[1], "base64url").toString()).exp;
  return new Date(exp * 1000).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
};
const tokensOk = async () => {
  const p = page.waitForResponse((r) => r.url().includes("/api/tokens") && r.request().method() === "GET", { timeout: 30000 }).catch(() => null);
  await page.goto(TOKENS_URL, { waitUntil: "domcontentloaded" });
  const r = await p;
  return !!r && r.status() === 200 && page.url().startsWith(TOKENS_URL);
};

if (CI) {
  log(`CI start: session ${(await tokensOk()) ? "alive" : "DEAD"}, expires ${await jwtExp()}`);
} else {
await page.goto(TOKENS_URL);
log("Sign in in the window.");
while (!(page.url().startsWith(TOKENS_URL) && (await context.cookies("https://account.smartthings.com")).some((c) => c.name === "_JTKN"))) {
  if (page.isClosed()) process.exit(1);
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(3000);
await saveSession(cfg, await context.storageState());
const { status, text } = await createPat(page, { scopes: cfg.scopes, name: `refresher-${Date.now()}` });
const token = extractToken(text);
if (token) await deliverPat(cfg, token);
log(`Signed in. Token ${token ? "delivered" : `FAILED (${status})`}. Session expires ${await jwtExp()}`);
}

for (let i = 1; i <= ROUNDS; i++) {
  await page.waitForTimeout(10 * 60 * 1000);
  const before = await jwtExp();
  // Force the renew chain: /login → Samsung authorize → back.
  await page.goto("https://account.smartthings.com/login", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(12000);
  const host = new URL(page.url()).host;
  const ok = await tokensOk();
  const after = await jwtExp();
  log(`#${i} renew via ${host}: ${ok ? "alive" : "DEAD"}, expiry ${before} -> ${after}`);
  if (ok) await saveSession(cfg, await context.storageState());
}
await browser.close();
