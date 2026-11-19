import { protectedRoute } from "@/lib/ac";
import { redis } from "@/lib/redis";

/**
 * Guarda a sessão do refresher/ (cookies da conta Samsung) já CRIPTOGRAFADA pelo robô.
 * O app nunca vê o conteúdo: a chave (SESSION_KEY) fica só com o robô.
 */
const KEY = "refresher:session";
const MAX = 512 * 1024;

export const GET = protectedRoute(async () => {
  const blob = await redis().get<string>(KEY);
  return Response.json({ blob: blob ?? null });
});

export const PUT = protectedRoute(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { blob?: unknown };
  if (typeof body.blob !== "string" || !/^[A-Za-z0-9+/=]+$/.test(body.blob) || body.blob.length > MAX) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  await redis().set(KEY, body.blob);
  return Response.json({ ok: true });
});
