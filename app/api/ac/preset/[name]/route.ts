import { applyState, protectedRoute } from "@/lib/ac";
import { presets } from "@/lib/presets";

export const POST = protectedRoute(
  async (_req: Request, ctx: { params: Promise<{ name: string }> }) => {
    const { name } = await ctx.params;
    const preset = Object.hasOwn(presets, name) ? presets[name] : undefined;
    if (!preset) return Response.json({ error: "preset_not_found" }, { status: 404 });
    return Response.json(await applyState(preset));
  },
);
