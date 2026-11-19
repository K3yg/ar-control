import { applyState, protectedRoute } from "@/lib/ac";
import { isMock, mockStatus } from "@/lib/mock";
import { desiredStateSchema } from "@/lib/schema";
import { getStatus } from "@/lib/smartthings";
import { needsReauth } from "@/lib/tokens";

export const GET = protectedRoute(async () => {
  if (isMock) return Response.json({ needsReauth: false, ...(await mockStatus()) });
  const reason = await needsReauth();
  if (reason) return Response.json({ needsReauth: true, reason });
  return Response.json({ needsReauth: false, ...(await getStatus()) });
});

export const POST = protectedRoute(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = desiredStateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return Response.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }
  return Response.json(await applyState(parsed.data));
});
