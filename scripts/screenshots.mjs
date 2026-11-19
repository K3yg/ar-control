// Takes README screenshots of the app in simulation mode.
// Usage: AC_MOCK=1 npm run dev   (in another terminal)
//        node scripts/screenshots.mjs [baseUrl] [key] [outDir]
// Needs Playwright, e.g. from refresher/: NODE_PATH=refresher/node_modules
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

async function shot(name, sky, setup) {
  await page.goto(`${base}/?sky=${sky}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".temp-num");
  await page.waitForTimeout(800);
  if (setup) await setup();
  await page.waitForTimeout(2600); // let the sky cross-fade and the air animate
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("saved", name);
}

await shot("sunset", "sunset");
await shot("day", "day");
await shot("night", "night");
await shot("windfree", "sunset", async () => {
  await page.getByRole("switch", { name: /WindFree/ }).click();
});
await shot("schedule", "day", async () => {
  await page.getByRole("button", { name: "Add" }).click();
});
await shot("full", "sunset", async () => {
  await page.evaluate(() => localStorage.removeItem("air:hinted"));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Details" }).click();
  await page.setViewportSize({ width: 390, height: 1500 });
});
await browser.close();
