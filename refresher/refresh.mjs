// Robot: uses the saved session to create a new PAT and deliver it to the app. No password, no captcha.
import { chromium } from "playwright";
import { TOKENS_URL, config, createPat, deliverPat, describe, extractToken, loadSession, saveSession } from "./lib.mjs";

const cfg = config();
const session = await loadSession(cfg);
if (!session) {
  console.error("No saved session. Run `npm run login` once on your computer.");
  process.exit(3);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ storageState: session });
  const page = await context.newPage();
  // The page loads the list from /api/tokens; when the session is gone it redirects to the Samsung login.
  const listedP = page
    .waitForResponse((r) => r.url().includes("/api/tokens") && r.request().method() === "GET", { timeout: 45000 })
    .catch(() => null);
  await page.goto(TOKENS_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  const listed = await listedP;
  if (!listed || listed.status() !== 200 || !page.url().startsWith(TOKENS_URL)) {
    console.error(`Session expired (url: ${page.url().split("?")[0]}). Run \`npm run login\` again.`);
    process.exit(4);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const { status, text } = await createPat(page, { scopes: cfg.scopes, name: `${cfg.namePrefix}-${stamp}` });
  if (status !== 200 && status !== 201) {
    console.error(`Token creation failed: HTTP ${status} ${describe(text)}`);
    process.exit(5);
  }
  const token = extractToken(text);
  if (!token) {
    console.error(`No token in the response: ${describe(text)}`);
    process.exit(6);
  }

  await deliverPat(cfg, token);
  console.log("New token delivered.");
  // Cookies were renewed: save them so the next run keeps the session alive.
  await saveSession(cfg, await context.storageState());
  console.log("Session updated.");
} finally {
  await browser.close();
}
