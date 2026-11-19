import { z } from "zod";
import { redis } from "./redis";
import { desiredStateSchema } from "./schema";

/** Editable presets, stored in Redis. Used by the app, Siri and schedules. */
export const presetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,32}$/),
  name: z.string().trim().min(1).max(30),
  state: desiredStateSchema,
});
export const presetListSchema = z.array(presetSchema).max(12);
export type Preset = z.infer<typeof presetSchema>;

const KEY = "ac:presets";

export const DEFAULT_PRESETS: Preset[] = [
  { id: "sleep", name: "Sleep", state: { power: "on", temp: 25, windFree: true, display: false } },
  { id: "cool-down", name: "Cool down", state: { power: "on", mode: "cool", temp: 21, fan: "turbo", swing: "all" } },
];

export async function getPresets(): Promise<Preset[]> {
  return (await redis().get<Preset[]>(KEY)) ?? DEFAULT_PRESETS;
}

export async function savePresets(list: Preset[]) {
  await redis().set(KEY, list);
}

/** Finds a preset by id or by name (case-insensitive), handy for Siri. */
export async function findPreset(idOrName: string): Promise<Preset | undefined> {
  const q = idOrName.toLowerCase().trim();
  const list = await getPresets();
  return list.find((p) => p.id === q) ?? list.find((p) => p.name.toLowerCase() === q);
}
