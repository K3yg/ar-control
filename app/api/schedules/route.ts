import { protectedRoute } from "@/lib/ac";
import { TIMEZONE, createSchedule, lastRun, listSchedules, newScheduleSchema } from "@/lib/schedules";

export const GET = protectedRoute(async () =>
  Response.json({ timezone: TIMEZONE, schedules: await listSchedules(), lastRun: await lastRun() }),
);

export const POST = protectedRoute(async (req: Request) => {
  const parsed = newScheduleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  return Response.json({ schedule: await createSchedule(parsed.data) }, { status: 201 });
});
