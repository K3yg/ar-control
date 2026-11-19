import { ST_API } from "./env";
import { AcError } from "./errors";
import { redis } from "./redis";

/**
 * SmartThings personal access token (lasts 24h). Delivered to POST /api/pat, pasted in the UI
 * or sent by refresher/. Takes priority over OAuth.
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

/** Checks the token against the API before saving, so a bad token never replaces a good one. */
export async function savePat(token: string) {
  const res = await fetch(`${ST_API}/devices`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403)
    throw new AcError("needs_reauth", "SmartThings rejected this token", 400);
  if (!res.ok) throw new AcError("smartthings", `SmartThings answered ${res.status}`, 502);
  const { items } = (await res.json()) as { items?: unknown[] };
  if (!items?.length) throw new AcError("no_device", "This token can't see any device. Check the account and the Devices permissions.", 400);
  await redis().set(PAT_KEY, { token, savedAt: Date.now() } satisfies StoredPat);
  await redis().del("st:needsReauth");
}

export async function invalidatePat() {
  await redis().del(PAT_KEY);
}
