import { z } from "zod";
import { type Command, type DisplayStrategy, COOL, OPTIONAL_OFF, WINDFREE, cmd } from "./capabilities";

const word = z.string().regex(/^[A-Za-z]{2,20}$/);

export const desiredStateSchema = z
  .object({
    power: z.enum(["on", "off"]).optional(),
    temp: z.coerce.number().int().min(16).max(30).optional(),
    mode: word.optional(),
    fan: word.optional(),
    swing: word.optional(),
    windFree: z.boolean().optional(),
    /** Any supported optional mode (sleep, quiet, windFreeSleep…). Wins over windFree. */
    optionalMode: word.optional(),
    display: z.boolean().optional(),
  })
  .strict();

export type DesiredState = z.infer<typeof desiredStateSchema>;

/** Order: power on → mode → temp → optional mode → fan → swing → display. Power off sends only off. */
export function buildCommands(s: DesiredState, display: DisplayStrategy): Command[] {
  if (s.power === "off") return [cmd.power(false)];
  const out: Command[] = [];
  if (s.power === "on") out.push(cmd.power(true));

  const optional = s.optionalMode ?? (s.windFree === undefined ? undefined : s.windFree ? WINDFREE : OPTIONAL_OFF);
  // WindFree only works in cool mode; when turning on or enabling it, make sure we're cooling.
  const mode = s.mode ?? (s.power === "on" || optional === WINDFREE ? COOL : undefined);
  if (mode) out.push(cmd.mode(mode));
  if (s.temp !== undefined) out.push(cmd.temp(s.temp));

  // A fixed fan speed isn't allowed during WindFree: leave WindFree first, like the Samsung app does.
  const leavesWindFree = s.fan && s.fan !== "auto" && optional === undefined;
  if (leavesWindFree) out.push(cmd.optionalMode(OPTIONAL_OFF));
  else if (optional) out.push(cmd.optionalMode(optional));

  if (s.fan) out.push(cmd.fan(s.fan));
  if (s.swing) out.push(cmd.swing(s.swing));
  if (s.display !== undefined) {
    const d = cmd.display(s.display, display);
    if (d) out.push(d);
  }
  return out;
}
