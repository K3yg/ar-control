// Assisted sign-in on your own computer: opens a window, fills in the Samsung email and password
// from .env (SAMSUNG_EMAIL, SAMSUNG_PASSWORD) and waits for you if a captcha shows up. Then it
// creates a token, delivers it to the app and closes. Uses a persistent browser profile (.profile/)
// so it looks like the same browser every day.
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { TOKENS_URL, config, createPat, deliverPat, extractToken, saveSession } from "./lib.mjs";

const cfg = config();
const email = process.env.SAMSUNG_EMAIL;
const password = process.env.SAMSUNG_PASSWORD;
const WAIT_MIN = Number(process.env.ASSIST_WAIT_MINUTES || 10);
const step = (m) => console.log(`${new Date().toLocaleTimeString("pt-BR")} ${m}`);

const profile = fileURLToPath(new URL(".profile", import.meta.url));
const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: { width: 1000, height: 800 } });
const page = context.pages()[0] ?? (await context.newPage());

const onTokens = async () =>
  page.url().startsWith(TOKENS_URL) &&
  (await page.evaluate(() => fetch("/api/tokens", { credentials: "include" }).then((r) => r.ok)).catch(() => false));

const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);

try {
  await page.goto(TOKENS_URL, { waitUntil: "domcontentloaded" });
  const deadline = Date.now() + WAIT_MIN * 60 * 1000;
  let filledEmail = false;
  let filledPassword = false;
  let told = false;

  while (!(await onTokens())) {
    if (page.isClosed() || Date.now() > deadline) throw new Error("Sign-in wasn't completed in time");
    if (new URL(page.url()).host === "account.samsung.com") {
      const emailBox = 'input[type="email"], input[name="iptLgnPlnID"], input[autocomplete="username"]';
      const passBox = 'input[type="password"]';
      if (email && !filledEmail && (await visible(emailBox)) && !(await visible(passBox))) {
        await page.locator(emailBox).first().fill(email);
        await page.getByRole("button", { name: /^(avançar|next|continuar|continue)$/i }).first().click().catch(() => {});
        filledEmail = true;
        step("Email filled in.");
      } else if (password && !filledPassword && (await visible(passBox))) {
        await page.locator(passBox).first().fill(password);
        await page.getByRole("button", { name: /^(entrar|sign in|fazer login|log in)$/i }).first().click().catch(() => {});
        filledPassword = true;
        step("Password filled in.");
      } else if (filledPassword && !told) {
        step("Waiting for you: solve the captcha in the window if there is one.");
        told = true;
      }
    }
    await page.waitForTimeout(1500);
  }

  step("Signed in.");
  await saveSession(cfg, await context.storageState());
  const { status, text } = await createPat(page, { scopes: cfg.scopes, name: `${cfg.namePrefix}-${Date.now()}` });
  const token = extractToken(text);
  if (!token) throw new Error(`Token creation failed (HTTP ${status})`);
  await deliverPat(cfg, token);
  step("Token created and delivered.");
} catch (e) {
  step(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
}
