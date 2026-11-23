import { appUrl, deleteSystemSchedule, verifyQstash } from "@/lib/schedules";

/**
 * Retired. A 20-minute keepalive used to live here, but the Samsung session can't be stretched past
 * ~2h, so the refresher robot now signs in again through Google instead. If QStash still calls this,
 * the leftover schedule deletes itself.
 */
const PATH = "/api/refresher/tick";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQstash(req, raw, appUrl(PATH)))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const removed = await deleteSystemSchedule(PATH);
  console.log("[refresher] retired keepalive schedule removed:", removed);
  return Response.json({ removed });
}
