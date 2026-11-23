import { Client, Receiver } from "@upstash/qstash";
import { z } from "zod";
import { AcError } from "./errors";
import { redis } from "./redis";
import { desiredStateSchema } from "./schema";

/**
 * Schedules run on Upstash QStash: at the set time QStash calls POST /api/schedules/run,
 * which applies a preset or a state. Nothing depends on the phone or the SmartThings token's age.
 * Without QSTASH_TOKEN (local dev) schedules are only stored in memory and never fire.
 */

export const TIMEZONE = process.env.AC_TIMEZONE || "America/Sao_Paulo";

export const actionSchema = z.union([
  z.object({ preset: z.string().min(1).max(40) }).strict(),
  z.object({ state: desiredStateSchema }).strict(),
]);

export const newScheduleSchema = z
  .object({
    name: z.string().trim().max(40).optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    /** 0 = Sunday … 6 = Saturday. Empty = every day. Ignored when once. */
    days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    once: z.boolean().default(false),
    action: actionSchema,
  })
  .strict();

export type NewSchedule = z.infer<typeof newScheduleSchema>;
export type Schedule = NewSchedule & { id: string; paused?: boolean };

const DEV_KEY = "dev:schedules";
export const LAST_RUN_KEY = "schedules:lastRun";

export async function lastRun() {
  return (await redis().get<{ at: number; time: string }>(LAST_RUN_KEY)) ?? null;
}

function qstash() {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;
  return new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
}

export function runUrl(): string {
  const base =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (!base) throw new AcError("smartthings", "APP_URL is not set; schedules need a public URL", 500);
  return `${base.replace(/\/$/, "")}/api/schedules/run`;
}

/** Date parts of "now" in the schedule time zone. */
function nowIn(tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

export function toCron(s: NewSchedule): string {
  const [h, m] = s.time.split(":").map(Number);
  if (s.once) {
    const now = nowIn(TIMEZONE);
    const today = h > now.h || (h === now.h && m > now.min);
    const target = new Date(Date.UTC(now.y, now.m - 1, now.d + (today ? 0 : 1)));
    return `CRON_TZ=${TIMEZONE} ${m} ${h} ${target.getUTCDate()} ${target.getUTCMonth() + 1} *`;
  }
  const days = s.days.length && s.days.length < 7 ? [...new Set(s.days)].sort().join(",") : "*";
  return `CRON_TZ=${TIMEZONE} ${m} ${h} * * ${days}`;
}

export async function listSchedules(): Promise<Schedule[]> {
  const client = qstash();
  if (!client) return (await redis().get<Schedule[]>(DEV_KEY)) ?? [];
  const url = runUrl();
  const all = await client.schedules.list();
  const out: Schedule[] = [];
  for (const s of all) {
    if (s.destination !== url) continue;
    try {
      const body = newScheduleSchema.parse(JSON.parse(s.body ?? "{}"));
      out.push({ ...body, id: s.scheduleId, paused: s.isPaused });
    } catch {
      // not ours / malformed: ignore
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export async function createSchedule(input: NewSchedule): Promise<Schedule> {
  const client = qstash();
  if (!client) {
    const list = (await redis().get<Schedule[]>(DEV_KEY)) ?? [];
    const s = { ...input, id: `dev-${Date.now()}` };
    await redis().set(DEV_KEY, [...list, s]);
    return s;
  }
  const { scheduleId } = await client.schedules.create({
    destination: runUrl(),
    cron: toCron(input),
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    retries: 2,
  });
  return { ...input, id: scheduleId };
}

export async function deleteSchedule(id: string) {
  const client = qstash();
  if (!client) {
    const list = (await redis().get<Schedule[]>(DEV_KEY)) ?? [];
    await redis().set(DEV_KEY, list.filter((s) => s.id !== id));
    return;
  }
  // Only delete schedules that belong to this app.
  const mine = await listSchedules();
  if (!mine.some((s) => s.id === id)) throw new AcError("smartthings", "Schedule not found", 404);
  await client.schedules.delete(id);
}

export async function deleteScheduleById(id: string) {
  await qstash()?.schedules.delete(id);
}

export function appUrl(path: string) {
  return runUrl().replace(/\/api\/schedules\/run$/, path);
}

export async function deleteSystemSchedule(path: string) {
  const client = qstash();
  if (!client) return 0;
  const url = appUrl(path);
  const mine = (await client.schedules.list()).filter((s) => s.destination === url);
  for (const s of mine) await client.schedules.delete(s.scheduleId);
  return mine.length;
}

export async function verifyQstash(req: Request, body: string, url = runUrl()): Promise<boolean> {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  const signature = req.headers.get("upstash-signature");
  if (!current || !next || !signature) return false;
  return new Receiver({ currentSigningKey: current, nextSigningKey: next })
    .verify({ signature, body, url })
    .catch(() => false);
}
