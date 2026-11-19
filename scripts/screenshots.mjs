// Takes README screenshots of the app in simulation mode.
// Usage: AC_MOCK=1 AC_API_KEY=preview npm run dev   (in another terminal)
//        node scripts/screenshots.mjs [baseUrl] [key] [outDir]
// Uses the Playwright installed in refresher/.
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.resolve("refresher/package.json"));
const { chromium, devices } = require("playwright");

const base = process.argv[2] || "http://localhost:3000";
const key = process.argv[3] || "preview";
const out = process.argv[4] || "docs/screenshots";

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 14"], locale: "en-US" });
const page = await ctx.newPage();
await page.request.post(`${base}/api/session`, { data: { key } });
const setState = (state) => page.request.post(`${base}/api/ac`, { data: state, headers: { "x-ac-key": key } });

const NORMAL = { power: "on", mode: "cool", temp: 24, windFree: false, fan: "high", swing: "vertical", display: true };

async function shot(name, sky, state, after) {
  await setState(state);
  await page.goto(`${base}/?sky=${sky}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".temp-num");
  if (after) await after();
  await page.waitForTimeout(3000); // let the sky cross-fade and the air animate
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("saved", name);
}

await shot("sunset", "sunset", NORMAL);
await shot("day", "day", { ...NORMAL, fan: "medium", swing: "fixed" });
await shot("night", "night", { ...NORMAL, fan: "low", swing: "horizontal" });
await shot("windfree", "sunset", { ...NORMAL, windFree: true, fan: "auto" });
await shot("schedule", "day", NORMAL, () => page.getByRole("button", { name: "Add" }).click());
await shot("full", "sunset", NORMAL, async () => {
  await page.getByRole("button", { name: "Details" }).click();
  await page.setViewportSize({ width: 390, height: 1560 });
});
await setState(NORMAL);
await browser.close();
