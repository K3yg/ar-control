import { z } from "zod";
import { type Command, type DisplayStrategy, COOL_MODE, cmd } from "./capabilities";

export const desiredStateSchema = z
  .object({
    power: z.enum(["on", "off"]).optional(),
    temp: z.coerce.number().int().min(16).max(30).optional(),
    windFree: z.boolean().optional(),
    display: z.boolean().optional(),
    mode: z.enum(["cool", "dry", "wind", "auto", "heat"]).optional(),
  })
  .strict();

export type DesiredState = z.infer<typeof desiredStateSchema>;

/** Ordem: power on → mode → temp → windFree → display. Se power off, envia só o off. */
export function buildCommands(s: DesiredState, display: DisplayStrategy): Command[] {
  if (s.power === "off") return [cmd.power(false)];
  const out: Command[] = [];
  if (s.power === "on") out.push(cmd.power(true));
  // WindFree só funciona em resfriar; ao ligar, garante o modo cool (a menos que outro tenha sido pedido).
  const mode = s.mode ?? (s.power === "on" || s.windFree ? COOL_MODE : undefined);
  if (mode) out.push(cmd.mode(mode));
  if (s.temp !== undefined) out.push(cmd.temp(s.temp));
  if (s.windFree !== undefined) out.push(cmd.windFree(s.windFree));
  if (s.display !== undefined) {
    const d = cmd.display(s.display, display);
    if (d) out.push(d);
  }
  return out;
}
