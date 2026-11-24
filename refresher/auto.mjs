// Run often (e.g. hourly from Windows Task Scheduler). Does nothing while the app's token is fresh;
// once it's older than MIN_AGE_HOURS (default 20), creates a new one: the saved session first,
// then the assisted sign-in (assist.mjs). Appends one line per run to auto.log.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./lib.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const log = (m) => appendFileSync(new URL("auto.log", import.meta.url), `${new Date().toLocaleString("pt-BR")} ${m}\n`);
const cfg = config();
const minAge = Number(process.env.MIN_AGE_HOURS || 20) * 3600 * 1000;

try {
  const res = await fetch(cfg.patTarget, { headers: { "x-ac-key": cfg.appKey }, signal: AbortSignal.timeout(15000) });
  const { savedAt } = await res.json();
  const age = savedAt ? Date.now() - Date.parse(savedAt) : Infinity;
  if (res.ok && age < minAge) process.exit(0); // fresh, stay quiet
  log(`token is ${Number.isFinite(age) ? (age / 3600000).toFixed(1) + "h" : "missing"} old, renewing`);
} catch (e) {
  log(`couldn't reach the app (${e.message}), skipping`);
  process.exit(1);
}

const run = (...args) => spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8", timeout: 12 * 60 * 1000 });
for (const args of [["refresh.mjs"], ["assist.mjs"]]) {
  const r = run(...args);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").pop();
  log(`${args.join(" ")}: ${r.status === 0 ? "ok" : `failed (${r.status})`} ${out}`);
  if (r.status === 0) process.exit(0);
}
process.exit(1);
