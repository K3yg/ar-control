import { protectedRoute } from "@/lib/ac";
import { errorResponse } from "@/lib/errors";
import { refresherStatus, tick } from "@/lib/refresher";
import { appUrl, ensureSystemSchedule, verifyQstash } from "@/lib/schedules";

export const maxDuration = 30;
const PATH = "/api/refresher/tick";
const CRON = "*/20 * * * *";

/** QStash calls this every 20 minutes to keep the Samsung session alive (see lib/refresher.ts). */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQstash(req, raw, appUrl(PATH)))) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const s = await tick();
    console.log("[refresher]", s.message);
    return Response.json(s);
  } catch (e) {
    console.error("[refresher] failed:", e instanceof Error ? e.message : e);
    return errorResponse(e);
  }
}

/** Status. ?run=1 runs a tick now (and makes sure the QStash schedule exists); ?force=1 also makes a new token. */
export const GET = protectedRoute(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  if (!q.has("run") && !q.has("force")) return Response.json({ status: await refresherStatus() });
  const schedule = await ensureSystemSchedule(PATH, CRON);
  const status = await tick({ force: q.has("force") });
  return Response.json({ schedule: !!schedule, status });
});
