import type { AcStatus } from "./capabilities";
import type { DesiredState } from "./schema";

/** Simulation mode for development (AC_MOCK=1): no SmartThings, no Redis needed. */
export const isMock = process.env.AC_MOCK === "1" && process.env.NODE_ENV !== "production";

const g = globalThis as unknown as { __acMock?: AcStatus };
const state = (): AcStatus =>
  (g.__acMock ??= {
    power: "on",
    mode: "cool",
    modes: ["auto", "cool", "dry", "wind"],
    targetTemp: 24,
    minTemp: 16,
    maxTemp: 30,
    currentTemp: 27,
    humidity: 61,
    fanMode: "auto",
    fanModes: ["auto", "low", "medium", "high", "turbo"],
    availableFanModes: ["auto", "low", "medium", "high", "turbo"],
    swing: "vertical",
    swingModes: ["fixed", "vertical", "horizontal", "all"],
    optionalMode: "off",
    optionalModes: ["off", "sleep", "quiet", "smart", "speed", "windFree", "windFreeSleep"],
    windFree: false,
    display: true,
    watts: 364,
    energyKwh: 982.2,
    online: true,
  });

export async function mockStatus(): Promise<AcStatus> {
  await new Promise((r) => setTimeout(r, 250));
  return { ...state() };
}

export async function mockApply(s: DesiredState) {
  await new Promise((r) => setTimeout(r, 600)); // cloud-like latency
  const cur = state();
  if (s.power) cur.power = s.power;
  if (s.power !== "off") {
    if (s.temp !== undefined) cur.targetTemp = s.temp;
    if (s.mode) cur.mode = s.mode;
    const optional = s.optionalMode ?? (s.windFree === undefined ? undefined : s.windFree ? "windFree" : "off");
    if (optional) cur.optionalMode = optional;
    if ((s.fan || s.swing) && optional === undefined) cur.optionalMode = "off"; // like the real unit
    if (s.fan) cur.fanMode = s.fan;
    if (s.swing) cur.swing = s.swing;
    if (s.display !== undefined) cur.display = s.display;
    cur.windFree = cur.optionalMode?.startsWith("windFree") ?? false;
    if (cur.windFree) cur.fanMode = "auto";
    cur.availableFanModes = cur.windFree ? ["auto"] : cur.fanModes;
  }
  return { ok: true, applied: s, commands: ["mock"] };
}
