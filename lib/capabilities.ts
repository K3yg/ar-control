/**
 * Single source of truth for the Samsung WindFree capabilities.
 * Everything that depends on the real device lives here. GET /api/debug shows the raw status.
 */

export type Command = {
  component: string;
  capability: string;
  command: string;
  arguments?: unknown[];
};

const C = "main";

export const caps = {
  switch: "switch",
  mode: "airConditionerMode",
  setpoint: "thermostatCoolingSetpoint",
  temperature: "temperatureMeasurement",
  humidity: "relativeHumidityMeasurement",
  fan: "airConditionerFanMode",
  swing: "fanOscillationMode",
  optionalMode: "custom.airConditionerOptionalMode",
  lighting: "samsungce.airConditionerLighting",
  energy: "powerConsumptionReport",
  execute: "execute",
} as const;

export const WINDFREE = "windFree";
export const OPTIONAL_OFF = "off";
export const COOL = "cool";

/**
 * How to control the display:
 *  - "lighting": samsungce.airConditionerLighting (on/off), when the device has it.
 *  - "execute": community workaround through the execute capability. Note: "Light_On" turns the display OFF.
 *  - "none": unsupported.
 * "auto" picks "lighting" when available, otherwise "execute".
 */
export type DisplayStrategy = "lighting" | "execute" | "none";
export const DISPLAY_STRATEGY: DisplayStrategy | "auto" =
  (process.env.AC_DISPLAY_STRATEGY as DisplayStrategy | undefined) ?? "auto";

export function resolveDisplayStrategy(deviceCaps: string[]): DisplayStrategy {
  if (DISPLAY_STRATEGY !== "auto") return DISPLAY_STRATEGY;
  if (deviceCaps.includes(caps.lighting)) return "lighting";
  if (deviceCaps.includes(caps.execute)) return "execute";
  return "none";
}

const c = (capability: string, command: string, ...args: unknown[]): Command => ({
  component: C,
  capability,
  command,
  ...(args.length ? { arguments: args } : {}),
});

export const cmd = {
  power: (on: boolean) => c(caps.switch, on ? "on" : "off"),
  mode: (mode: string) => c(caps.mode, "setAirConditionerMode", mode),
  temp: (t: number) => c(caps.setpoint, "setCoolingSetpoint", t),
  optionalMode: (mode: string) => c(caps.optionalMode, "setAcOptionalMode", mode),
  fan: (mode: string) => c(caps.fan, "setFanMode", mode),
  swing: (mode: string) => c(caps.swing, "setFanOscillationMode", mode),
  display: (on: boolean, strategy: DisplayStrategy): Command | null => {
    if (strategy === "lighting") return c(caps.lighting, on ? "on" : "off");
    if (strategy === "execute")
      // Inverted naming: Light_On turns the display off, Light_Off turns it on.
      return c(caps.execute, "execute", "mode/vs/0", { "x.com.samsung.da.options": [on ? "Light_Off" : "Light_On"] });
    return null;
  },
};

type Attr = { value?: unknown };
export type RawStatus = { components?: Record<string, Record<string, Record<string, Attr>>> };

export type AcStatus = {
  power: "on" | "off" | null;
  mode: string | null;
  modes: string[];
  targetTemp: number | null;
  minTemp: number;
  maxTemp: number;
  currentTemp: number | null;
  humidity: number | null;
  fanMode: string | null;
  fanModes: string[];
  /** Fan speeds the unit accepts right now (WindFree locks it to "auto"). */
  availableFanModes: string[];
  swing: string | null;
  swingModes: string[];
  optionalMode: string | null;
  optionalModes: string[];
  windFree: boolean | null;
  display: boolean | null;
  watts: number | null;
  energyKwh: number | null;
  online: boolean;
};

export function normalizeStatus(raw: RawStatus, online: boolean): AcStatus {
  const main = raw.components?.[C] ?? {};
  const v = (cap: string, attr: string) => main[cap]?.[attr]?.value;
  const num = (x: unknown) => (typeof x === "number" ? x : null);
  const str = (x: unknown) => (typeof x === "string" ? x : null);
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []);

  const power = v(caps.switch, "switch");
  const optional = str(v(caps.optionalMode, "acOptionalMode"));
  const lighting = v(caps.lighting, "lighting");
  const report = v(caps.energy, "powerConsumption") as { power?: number; energy?: number } | undefined;
  const fanModes = list(v(caps.fan, "supportedAcFanModes"));
  const available = list(v(caps.fan, "availableAcFanModes"));

  return {
    power: power === "on" || power === "off" ? power : null,
    mode: str(v(caps.mode, "airConditionerMode")),
    modes: list(v(caps.mode, "supportedAcModes")),
    targetTemp: num(v(caps.setpoint, "coolingSetpoint")),
    minTemp: num(v("custom.thermostatSetpointControl", "minimumSetpoint")) ?? 16,
    maxTemp: num(v("custom.thermostatSetpointControl", "maximumSetpoint")) ?? 30,
    currentTemp: num(v(caps.temperature, "temperature")),
    humidity: num(v(caps.humidity, "humidity")),
    fanMode: str(v(caps.fan, "fanMode")),
    fanModes,
    availableFanModes: available.length ? available : fanModes,
    swing: str(v(caps.swing, "fanOscillationMode")),
    swingModes: list(v(caps.swing, "supportedFanOscillationModes")),
    optionalMode: optional,
    optionalModes: list(v(caps.optionalMode, "supportedAcOptionalMode")),
    windFree: optional ? optional.toLowerCase().startsWith("windfree") : null,
    display: lighting === "on" ? true : lighting === "off" ? false : null,
    watts: num(report?.power),
    energyKwh: typeof report?.energy === "number" ? Math.round(report.energy / 100) / 10 : null,
    online,
  };
}
