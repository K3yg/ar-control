import { isCronAuthorized } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { forceRefresh } from "@/lib/tokens";

/** Daily cron: refreshes the OAuth pair so the refresh token never gets older than ~1 day. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const t = await forceRefresh();
    console.log("[cron] tokens refreshed, expiring at", new Date(t.expiresAt).toISOString());
    return Response.json({ ok: true, expiresAt: t.expiresAt });
  } catch (e) {
    console.error("[cron] refresh failed");
    return errorResponse(e);
  }
}
