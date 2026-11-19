import { applyPreset, applyState } from "@/lib/ac";
import { errorResponse } from "@/lib/errors";
import { deleteScheduleById, newScheduleSchema, verifyQstash } from "@/lib/schedules";

/** Called by QStash at the scheduled time. Authenticated by the QStash signature, not the app key. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQstash(req, raw))) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = newScheduleSchema.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const s = parsed.data;

  try {
    if ("preset" in s.action) {
      if (!(await applyPreset(s.action.preset))) console.error("[schedule] preset not found:", s.action.preset);
    } else {
      await applyState(s.action.state);
    }
  } catch (e) {
    console.error("[schedule] failed:", e instanceof Error ? e.message : e);
    return errorResponse(e); // non-2xx → QStash retries
  } finally {
    const id = req.headers.get("upstash-schedule-id");
    if (s.once && id) await deleteScheduleById(id).catch(() => {});
  }
  return Response.json({ ok: true });
}
