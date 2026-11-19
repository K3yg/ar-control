import type { DesiredState } from "./schema";

/** Presets usados pelos atalhos da Siri e pelo botão "Dormir". */
export const presets: Record<string, DesiredState> = {
  sleep: { power: "on", temp: 25, windFree: true, display: false },
};
