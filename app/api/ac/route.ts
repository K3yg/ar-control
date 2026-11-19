import { applyState, protectedRoute, readStatus } from "@/lib/ac";
import { isMock } from "@/lib/mock";
import { desiredStateSchema } from "@/lib/schema";
import { needsReauth } from "@/lib/tokens";

export const GET = protectedRoute(async () => {
  if (!isMock) {
    const reason = await needsReauth();
    if (reason) return Response.json({ needsReauth: true, reason });
  }
  return Response.json({ needsReauth: false, ...(await readStatus()) });
});

export const POST = protectedRoute(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = desiredStateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return Response.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }
  return Response.json(await applyState(parsed.data));
});
