import { protectedRoute } from "@/lib/ac";
import { getPresets, presetListSchema, savePresets } from "@/lib/presets";

export const GET = protectedRoute(async () => Response.json({ presets: await getPresets() }));

/** Replaces the whole list (the app edits it locally and saves). */
export const PUT = protectedRoute(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { presets?: unknown };
  const parsed = presetListSchema.safeParse(body.presets);
  if (!parsed.success) return Response.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  const ids = new Set(parsed.data.map((p) => p.id));
  if (ids.size !== parsed.data.length) return Response.json({ error: "invalid", message: "Duplicate preset ids" }, { status: 400 });
  await savePresets(parsed.data);
  return Response.json({ presets: parsed.data });
});
