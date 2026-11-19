/**
 * Mapeamento central das capabilities do ar Samsung WindFree.
 * Tudo o que depende do aparelho real fica aqui. Confirme os valores em docs/capabilities.md
 * (a rota GET /api/debug mostra o status bruto do aparelho).
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
  optionalMode: "custom.airConditionerOptionalMode",
  lighting: "samsungce.airConditionerLighting",
  execute: "execute",
} as const;

export const WINDFREE_VALUE = "windFree";
export const OPTIONAL_MODE_OFF = "off";
export const COOL_MODE = "cool";

/**
 * Como controlar o display:
 *  - "lighting": capability samsungce.airConditionerLighting (on/off), se o aparelho tiver.
 *  - "execute": hack da comunidade via capability execute. Atenção: "Light_On" DESLIGA o display.
 *  - "none": sem suporte.
 * "auto" escolhe "lighting" se existir no aparelho, senão "execute".
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

export const cmd = {
  power: (on: boolean): Command => ({ component: C, capability: caps.switch, command: on ? "on" : "off" }),
  mode: (mode: string): Command => ({
    component: C,
    capability: caps.mode,
    command: "setAirConditionerMode",
    arguments: [mode],
  }),
  temp: (t: number): Command => ({
    component: C,
    capability: caps.setpoint,
    command: "setCoolingSetpoint",
    arguments: [t],
  }),
  windFree: (on: boolean): Command => ({
    component: C,
    capability: caps.optionalMode,
    command: "setAcOptionalMode",
    arguments: [on ? WINDFREE_VALUE : OPTIONAL_MODE_OFF],
  }),
  display: (on: boolean, strategy: DisplayStrategy): Command | null => {
    if (strategy === "lighting") return { component: C, capability: caps.lighting, command: on ? "on" : "off" };
    if (strategy === "execute")
      return {
        component: C,
        capability: caps.execute,
        command: "execute",
        // Nome invertido: Light_On desliga o display, Light_Off liga.
        arguments: ["mode/vs/0", { "x.com.samsung.da.options": [on ? "Light_Off" : "Light_On"] }],
      };
    return null;
  },
};

type Attr = { value?: unknown };
export type RawStatus = { components?: Record<string, Record<string, Record<string, Attr>>> };

export type AcStatus = {
  power: "on" | "off" | null;
  mode: string | null;
  targetTemp: number | null;
  currentTemp: number | null;
  windFree: boolean | null;
  display: boolean | null;
  online: boolean;
};

export function normalizeStatus(raw: RawStatus, online: boolean): AcStatus {
  const main = raw.components?.[C] ?? {};
  const v = (cap: string, attr: string) => main[cap]?.[attr]?.value;
  const num = (x: unknown) => (typeof x === "number" ? x : null);

  const power = v(caps.switch, "switch");
  const optional = v(caps.optionalMode, "acOptionalMode");
  const lighting = v(caps.lighting, "lighting");

  return {
    power: power === "on" || power === "off" ? power : null,
    mode: (v(caps.mode, "airConditionerMode") as string) ?? null,
    targetTemp: num(v(caps.setpoint, "coolingSetpoint")),
    currentTemp: num(v(caps.temperature, "temperature")),
    windFree: typeof optional === "string" ? optional.toLowerCase().startsWith("windfree") : null,
    display: lighting === "on" ? true : lighting === "off" ? false : null,
    online,
  };
}
