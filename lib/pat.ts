import { ST_API } from "./env";
import { AcError } from "./errors";
import { redis } from "./redis";

/**
 * Personal Access Token do SmartThings (dura 24h). Entregue por POST /api/pat — colado na UI
 * ou enviado automaticamente pelo refresher/. Tem prioridade sobre o OAuth.
 */
const PAT_KEY = "st:pat";

export type StoredPat = { token: string; savedAt: number };

export async function readPat(): Promise<string | null> {
  const stored = await redis().get<StoredPat>(PAT_KEY);
  return stored?.token ?? null;
}

export async function patInfo(): Promise<StoredPat | null> {
  return (await redis().get<StoredPat>(PAT_KEY)) ?? null;
}

/** Valida o token contra a API antes de salvar, para não trocar um token bom por um ruim. */
export async function savePat(token: string) {
  const res = await fetch(`${ST_API}/devices`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403)
    throw new AcError("needs_reauth", "Token recusado pelo SmartThings", 400);
  if (!res.ok) throw new AcError("smartthings", `SmartThings respondeu ${res.status}`, 502);
  const { items } = (await res.json()) as { items?: unknown[] };
  if (!items?.length) throw new AcError("no_device", "Esse token não enxerga nenhum aparelho (conta certa? permissões de Devices?)", 400);
  await redis().set(PAT_KEY, { token, savedAt: Date.now() } satisfies StoredPat);
  await redis().del("st:needsReauth");
}

export async function invalidatePat() {
  await redis().del(PAT_KEY);
}
