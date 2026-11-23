// Test: sign in to Samsung through Google, so the robot can sign in again whenever the 2h session dies.
//   node google.mjs login   → visible window; click "Sign in with Google" once. Saves the session.
//   node google.mjs renew   → drops the Samsung/SmartThings cookies (as if expired), signs in again
//                             through Google with no human, creates a token. HEADED=1 to watch.
import { chromium } from "playwright";
import { TOKENS_URL, config, createPat, deliverPat, extractToken, loadSession, saveSession } from "./lib.mjs";

const mode = process.argv[2];
const cfg = config();
const step = (m) => console.log(`${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })} ${m}`);
const headless = mode === "renew" && !process.env.HEADED;
// channel "chromium" = the full browser in new headless mode.
// FedCM (Chrome's native account dialog) can't be clicked headless; without it Google uses a popup.
const browser = await chromium.launch({ headless, channel: "chromium", args: ["--disable-features=FedCm"] });
// Google turns down "HeadlessChrome" in the user agent; same browser, the plain Chrome name.
const UA = (await browser.newContext().then(async (c) => { const p = await c.newPage(); const ua = await p.evaluate(() => navigator.userAgent); await c.close(); return ua; })).replace("HeadlessChrome", "Chrome");

async function signedIn(page, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (page.isClosed()) return false;
    if (page.url().startsWith(TOKENS_URL)) {
      const ok = await page.evaluate(() => fetch("/api/tokens", { credentials: "include" }).then((r) => r.ok)).catch(() => false);
      if (ok) return true;
    }
    await page.waitForTimeout(1500);
  }
  return false;
}

async function finish(context, page) {
  await saveSession(cfg, await context.storageState());
  const { status, text } = await createPat(page, { scopes: cfg.scopes, name: `refresher-${Date.now()}` });
  const token = extractToken(text);
  if (!token) throw new Error(`Token creation failed (HTTP ${status})`);
  await deliverPat(cfg, token);
  step("Token created and delivered. Session saved.");
}

try {
  if (mode === "login") {
    const context = await browser.newContext({ userAgent: UA, locale: "en-US", viewport: { width: 1100, height: 850 } });
    const page = await context.newPage();
    await page.goto(TOKENS_URL);
    step('Click "Sign in with Google" in the window and finish signing in.');
    if (!(await signedIn(page, 10 * 60 * 1000))) throw new Error("Sign-in wasn't completed");
    const google = (await context.cookies("https://accounts.google.com")).length;
    step(`Signed in. Google cookies: ${google}.`);
    await finish(context, page);
  } else if (mode === "renew") {
    const state = await loadSession(cfg);
    // Keep only Google's cookies: Samsung and SmartThings behave as if their session expired.
    const keep = state.cookies.filter((c) => /google\.com$/.test(c.domain.replace(/^\./, "")));
    step(`Starting with ${keep.length} Google cookies, no Samsung session.`);
    const context = await browser.newContext({ userAgent: UA, locale: "en-US", storageState: { cookies: keep, origins: [] } });
    const page = await context.newPage();
    await page.goto(TOKENS_URL, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/account\.samsung\.com/, { timeout: 30000 });
    step("At the Samsung sign-in.");
    // The Google button only works once the page finished loading its scripts.
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
    if (process.env.DEBUG) {
      context.on("response", (r) => {
        const u = new URL(r.url());
        if (!/\.(js|css|png|svg|woff2?|ico|json)$/.test(u.pathname) && !/datadog|analytics|gstatic|recaptcha/.test(u.host))
          step(`  ${r.status()} ${r.request().method()} ${u.host}${u.pathname}`);
      });
    }
    const popupP = context.waitForEvent("page", { timeout: 15000 }).catch(() => null);
    await page.getByRole("button", { name: /google/i }).first().click({ timeout: 20000 });
    step("Clicked Sign in with Google.");
    const popup = await popupP;
    if (popup) step("Google opened in a popup.");
    // Google may show the account chooser and/or a Continue button.
    const end = Date.now() + 90000;
    while (Date.now() < end && !page.url().startsWith(TOKENS_URL)) {
      const g = popup && !popup.isClosed() ? popup : page;
      const host = new URL(g.url()).host;
      if (host === "accounts.google.com") {
        const chooser = g.locator("[data-identifier]").first();
        if (await chooser.isVisible().catch(() => false)) {
          step("Google account chooser: picking the account.");
          await chooser.click().catch(() => {});
        }
        const cont = g.getByRole("button", { name: /^(continue|continuar|allow|permitir)$/i }).first();
        if (await cont.isVisible().catch(() => false)) {
          step("Google: Continue.");
          await cont.click().catch(() => {});
        }
        if (await g.locator('input[type="email"], input[type="password"]').first().isVisible().catch(() => false)) {
          throw new Error("Google asked for the email/password: its session isn't enough on its own");
        }
      }
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: "google-stuck.png" }).catch(() => {});
    if (popup && !popup.isClosed()) await popup.screenshot({ path: "google-popup.png" }).catch(() => {});
    if (!(await signedIn(page, 20000))) throw new Error(`Didn't get back to the tokens page (stuck at ${new URL(page.url()).host}${new URL(page.url()).pathname})`);
    step("Signed in again through Google, no human.");
    await finish(context, page);
  } else {
    console.log("Usage: node google.mjs login|renew");
  }
} catch (e) {
  step(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
