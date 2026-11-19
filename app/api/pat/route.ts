import { protectedRoute } from "@/lib/ac";
import { patInfo, savePat } from "@/lib/pat";
import { redis } from "@/lib/redis";

/** Recebe um Personal Access Token do SmartThings (colado na UI ou enviado pelo refresher/). */
export const POST = protectedRoute(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[A-Za-z0-9-]{20,100}$/.test(token)) {
    return Response.json({ error: "invalid", message: "Token em formato inválido" }, { status: 400 });
  }
  await savePat(token);
  await redis().del("st:device");
  return Response.json({ ok: true });
});

export const GET = protectedRoute(async () => {
  const info = await patInfo();
  return Response.json({ hasPat: !!info, savedAt: info ? new Date(info.savedAt).toISOString() : null });
});
