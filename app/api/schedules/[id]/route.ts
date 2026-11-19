import { protectedRoute } from "@/lib/ac";
import { deleteSchedule } from "@/lib/schedules";

export const DELETE = protectedRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await deleteSchedule(id);
  return Response.json({ ok: true });
});
