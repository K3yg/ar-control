import type { AcStatus } from "./capabilities";
import type { DesiredState } from "./schema";

/** Modo de simulação para desenvolvimento (AC_MOCK=1): sem SmartThings nem Redis. */
export const isMock = process.env.AC_MOCK === "1" && process.env.NODE_ENV !== "production";

const g = globalThis as unknown as { __acMock?: AcStatus };
const state = (): AcStatus =>
  (g.__acMock ??= {
    power: "on",
    mode: "cool",
    targetTemp: 24,
    currentTemp: 27,
    windFree: false,
    display: true,
    online: true,
  });

export async function mockStatus(): Promise<AcStatus> {
  await new Promise((r) => setTimeout(r, 300));
  return { ...state() };
}

export async function mockApply(s: DesiredState) {
  await new Promise((r) => setTimeout(r, 700)); // latência parecida com a nuvem
  const cur = state();
  if (s.power) cur.power = s.power;
  if (s.power !== "off") {
    if (s.temp !== undefined) cur.targetTemp = s.temp;
    if (s.windFree !== undefined) cur.windFree = s.windFree;
    if (s.display !== undefined) cur.display = s.display;
    if (s.mode) cur.mode = s.mode;
  }
  return { ok: true, applied: s, commands: ["mock"] };
}
