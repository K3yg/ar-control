// One-time manual login: opens a visible browser, you sign in to Samsung (captcha included)
// and the session is saved, encrypted, to the store. After that refresh.mjs runs on its own.
import { chromium } from "playwright";
import { TOKENS_URL, config, saveSession } from "./lib.mjs";

const cfg = config();
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
const page = await context.newPage();

// Really signed in = the tokens page managed to list the tokens.
let loggedIn = false;
page.on("response", (r) => {
  if (r.url().startsWith("https://account.smartthings.com/api/tokens") && r.status() === 200) loggedIn = true;
});
await page.goto(TOKENS_URL);

console.log("Sign in in the window that opened. It closes by itself once the tokens page loads.");
const deadline = Date.now() + 10 * 60 * 1000;
while (!loggedIn) {
  if (page.isClosed() || Date.now() > deadline) {
    console.error("Sign-in wasn't completed.");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
await page.waitForTimeout(1500);

await saveSession(cfg, await context.storageState());
await browser.close();
console.log("Session saved. Run `npm start` to create the first token.");
