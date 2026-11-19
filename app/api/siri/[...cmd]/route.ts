import { applyPreset, applyState, readStatus } from "@/lib/ac";
import { checkKey, isAuthorized } from "@/lib/auth";
import { redis } from "@/lib/redis";
import type { AcStatus } from "@/lib/capabilities";
import type { DesiredState } from "@/lib/schema";
import { createSchedule, listSchedules } from "@/lib/schedules";

/**
 * Siri-friendly API: one short path per action, plain-text answer for Siri to speak.
 *   /api/siri/status            /api/siri/on            /api/siri/off
 *   /api/siri/temp/23           /api/siri/mode/dry      /api/siri/fan/high
 *   /api/siri/swing/vertical    /api/siri/windfree/on   /api/siri/display/off
 *   /api/siri/preset/sleep      /api/siri/schedules     /api/siri/schedule/off/04:00[/once]
 * Answers in English; add ?lang=pt for Portuguese.
 * Auth: the x-ac-key header, or ?key=<AC_API_KEY> in the URL (simplest for Shortcuts).
 * /api/siri/log lists the last calls, including rejected ones, to debug shortcuts.
 */

type Lang = "en" | "pt";

const t = {
  en: {
    off: "The AC is off.",
    status: (s: AcStatus) =>
      `The AC is on, ${s.targetTemp}°, ${label("en", s.mode)}${s.windFree ? ", WindFree" : `, fan ${label("en", s.fanMode)}`}. It's ${s.currentTemp}° in the room.`,
    done: (what: string) => `Done, ${what}.`,
    turnedOn: "AC on",
    turnedOff: "AC off",
    temp: (n: number) => `set to ${n}°`,
    unknown: "I didn't understand that command.",
    noPreset: (p: string) => `There's no preset called ${p}.`,
    preset: (p: string) => `${p} applied`,
    none: "You have no schedules.",
    list: (items: string[]) => `You have ${items.length} schedule${items.length > 1 ? "s" : ""}: ${items.join("; ")}.`,
    scheduled: (what: string, time: string, once: boolean) => `Scheduled: ${what} at ${time}${once ? "" : " every day"}.`,
    offline: "The AC is offline.",
  },
  pt: {
    off: "O ar está desligado.",
    status: (s: AcStatus) =>
      `O ar está ligado, ${s.targetTemp} graus, ${label("pt", s.mode)}${s.windFree ? ", WindFree" : `, ventilador ${label("pt", s.fanMode)}`}. No quarto estão ${s.currentTemp} graus.`,
    done: (what: string) => `Pronto, ${what}.`,
    turnedOn: "ar ligado",
    turnedOff: "ar desligado",
    temp: (n: number) => `${n} graus`,
    unknown: "Não entendi o comando.",
    noPreset: (p: string) => `Não existe preset chamado ${p}.`,
    preset: (p: string) => `${p} aplicado`,
    none: "Você não tem agendamentos.",
    list: (items: string[]) => `Você tem ${items.length} agendamento${items.length > 1 ? "s" : ""}: ${items.join("; ")}.`,
    scheduled: (what: string, time: string, once: boolean) => `Agendado: ${what} às ${time}${once ? "" : " todo dia"}.`,
    offline: "O ar está offline.",
  },
};

const names: Record<Lang, Record<string, string>> = {
  en: { cool: "cooling", dry: "dry", wind: "fan only", auto: "auto", low: "low", medium: "medium", high: "high", turbo: "turbo", fixed: "fixed", vertical: "up and down", horizontal: "side to side", all: "all directions" },
  pt: { cool: "resfriando", dry: "desumidificar", wind: "só ventilar", auto: "automático", low: "baixo", medium: "médio", high: "alto", turbo: "turbo", fixed: "fixo", vertical: "para cima e para baixo", horizontal: "para os lados", all: "todas as direções" },
};
const label = (lang: Lang, v: string | null) => (v ? names[lang][v] ?? v : "");

const say = (text: string, status = 200) =>
  new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

async function handle(req: Request, ctx: { params: Promise<{ cmd: string[] }> }) {
  const lang: Lang = new URL(req.url).searchParams.get("lang") === "pt" ? "pt" : "en";
  const L = t[lang];
  const [action, arg, extra] = (await ctx.params).cmd.map((s) => decodeURIComponent(s).toLowerCase());
  const on = (v?: string) => ["on", "true", "1", "ligar", "liga"].includes(v ?? "");

  const set = async (state: DesiredState, what: string) => {
    await applyState(state);
    return say(L.done(what));
  };

  switch (action) {
    case "status": {
      const s = await readStatus();
      if (!s.online) return say(L.offline);
      return say(s.power === "on" ? L.status(s) : L.off);
    }
    case "on":
      return set({ power: "on" }, L.turnedOn);
    case "off":
      return set({ power: "off" }, L.turnedOff);
    case "temp": {
      const n = Number(arg);
      if (!Number.isInteger(n) || n < 16 || n > 30) return say(L.unknown, 400);
      return set({ temp: n }, L.temp(n));
    }
    case "mode":
      return arg ? set({ mode: arg === "fan" ? "wind" : arg }, label(lang, arg === "fan" ? "wind" : arg)) : say(L.unknown, 400);
    case "fan":
      return arg ? set({ fan: arg }, `fan ${label(lang, arg)}`) : say(L.unknown, 400);
    case "swing":
      return arg ? set({ swing: arg }, label(lang, arg)) : say(L.unknown, 400);
    case "windfree":
      return set({ windFree: on(arg) }, `WindFree ${on(arg) ? "on" : "off"}`);
    case "display":
      return set({ display: on(arg) }, `display ${on(arg) ? "on" : "off"}`);
    case "preset": {
      const p = arg ? await applyPreset(arg) : null;
      return p ? say(L.done(L.preset(p.name))) : say(L.noPreset(arg ?? ""), 404);
    }
    case "schedules": {
      const list = await listSchedules();
      if (!list.length) return say(L.none);
      const items = list.map((s) => `${"preset" in s.action ? s.action.preset : s.action.state.power === "off" ? L.turnedOff : L.turnedOn} ${s.time}`);
      return say(L.list(items));
    }
    case "schedule": {
      // /schedule/<off|on|presetName>/<HH:MM>[/once]
      const time = (extra ?? "").padStart(5, "0");
      if (!arg || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return say(L.unknown, 400);
      const action =
        arg === "off" ? { state: { power: "off" as const } } : arg === "on" ? { state: { power: "on" as const } } : { preset: arg };
      const once = new URL(req.url).pathname.endsWith("/once");
      await createSchedule({ time, days: [], once, action });
      return say(L.scheduled(arg, time, once));
    }
    case "log": {
      const hits = (await redis().get<Hit[]>(LOG_KEY)) ?? [];
      if (!hits.length) return say("No Siri calls yet.");
      return say(hits.map((h) => `${new Date(h.at).toISOString().slice(5, 19).replace("T", " ")} UTC  ${h.ok ? "ok " : "401"}  ${h.path}  ${h.ua}`).join("\n"));
    }
    default:
      return say(L.unknown, 404);
  }
}

/** Errors become a sentence too, so Siri says what went wrong instead of reading JSON. */
async function speak(req: Request, ctx: { params: Promise<{ cmd: string[] }> }) {
  try {
    return await handle(req, ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    return say(msg, 502);
  }
}

type Hit = { at: number; path: string; ok: boolean; ua: string };
const LOG_KEY = "siri:log";

async function logHit(hit: Hit) {
  try {
    const list = (await redis().get<Hit[]>(LOG_KEY)) ?? [];
    await redis().set(LOG_KEY, [hit, ...list].slice(0, 20));
  } catch {
    // logging must never break a command
  }
}

async function entry(req: Request, ctx: { params: Promise<{ cmd: string[] }> }) {
  const url = new URL(req.url);
  const ok = isAuthorized(req) || checkKey(url.searchParams.get("key"));
  if (!url.pathname.endsWith("/log")) {
    await logHit({ at: Date.now(), path: url.pathname, ok, ua: (req.headers.get("user-agent") ?? "").slice(0, 40) });
  }
  if (!ok) return say("The access key is missing or wrong. Check the key in the shortcut.", 401);
  return speak(req, ctx);
}

export const GET = entry;
export const POST = entry;
