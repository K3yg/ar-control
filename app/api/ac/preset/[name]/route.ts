import { applyPreset, protectedRoute } from "@/lib/ac";

export const POST = protectedRoute(async (_req: Request, ctx: { params: Promise<{ name: string }> }) => {
  const { name } = await ctx.params;
  const preset = await applyPreset(decodeURIComponent(name));
  if (!preset) return Response.json({ error: "preset_not_found", message: "No preset with that name" }, { status: 404 });
  return Response.json({ ok: true, preset: preset.id });
});
