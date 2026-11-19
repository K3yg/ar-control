import { isCronAuthorized } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { forceRefresh } from "@/lib/tokens";

/** Cron diária: renova o par de tokens para o refresh token nunca passar de ~1 dia de idade. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const t = await forceRefresh();
    console.log("[cron] tokens renovados, expiram em", new Date(t.expiresAt).toISOString());
    return Response.json({ ok: true, expiresAt: t.expiresAt });
  } catch (e) {
    console.error("[cron] refresh falhou");
    return errorResponse(e);
  }
}
