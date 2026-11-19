import {
  type AcStatus,
  type Command,
  type DisplayStrategy,
  type RawStatus,
  normalizeStatus,
  resolveDisplayStrategy,
} from "./capabilities";
import { env, ST_API } from "./env";
import { AcError } from "./errors";
import { redis } from "./redis";
import { forceRefresh, getValidAccessToken } from "./tokens";

const TIMEOUT_MS = 5000;
const DEVICE_KEY = "st:device";
const LAST_DISPLAY_KEY = "ac:lastDisplay";

async function stFetch<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = retried ? (await forceRefresh()).accessToken : await getValidAccessToken();
  let res: Response;
  try {
    res = await fetch(`${ST_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
      throw new AcError("timeout", "SmartThings não respondeu a tempo", 504);
    throw new AcError("smartthings", "Falha de rede ao falar com o SmartThings", 502);
  }

  if (res.status === 401 && !retried) return stFetch<T>(path, init, true);
  if (res.status === 401) throw new AcError("needs_reauth", "Token inválido. Reconecte o SmartThings.", 401);
  if (res.status === 429) throw new AcError("rate_limited", "Muitas requisições ao SmartThings, tente em instantes", 429);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
    const msg = data.error?.message ?? `SmartThings respondeu ${res.status}`;
    if (/offline/i.test(msg)) throw new AcError("offline", "O ar está offline", 503);
    throw new AcError("smartthings", msg, 502);
  }
  return (await res.json().catch(() => ({}))) as T;
}

type DeviceInfo = { id: string; label: string; caps: string[] };
type StDevice = {
  deviceId: string;
  label?: string;
  name?: string;
  components?: { id: string; capabilities: { id: string }[] }[];
};

function toInfo(d: StDevice): DeviceInfo {
  const main = d.components?.find((c) => c.id === "main") ?? d.components?.[0];
  return { id: d.deviceId, label: d.label ?? d.name ?? d.deviceId, caps: main?.capabilities.map((c) => c.id) ?? [] };
}

/** Aparelho alvo: ST_DEVICE_ID, ou o primeiro com airConditionerMode. Cacheado no Redis por 1 dia. */
export async function getDevice(): Promise<DeviceInfo> {
  const cached = await redis().get<DeviceInfo>(DEVICE_KEY);
  if (cached && (!env.deviceId || cached.id === env.deviceId)) return cached;

  let info: DeviceInfo;
  if (env.deviceId) {
    info = toInfo(await stFetch<StDevice>(`/devices/${env.deviceId}`));
  } else {
    const list = await stFetch<{ items: StDevice[] }>(`/devices?capability=airConditionerMode`);
    const first = list.items?.[0];
    if (!first) throw new AcError("no_device", "Nenhum ar-condicionado encontrado na conta", 404);
    info = toInfo(first);
  }
  await redis().set(DEVICE_KEY, info, { ex: 60 * 60 * 24 });
  return info;
}

export async function displayStrategy(): Promise<DisplayStrategy> {
  return resolveDisplayStrategy((await getDevice()).caps);
}

export async function getRawStatus(): Promise<RawStatus> {
  const { id } = await getDevice();
  return stFetch<RawStatus>(`/devices/${id}/status`);
}

export async function getStatus(): Promise<AcStatus> {
  const { id } = await getDevice();
  const [raw, health, lastDisplay] = await Promise.all([
    stFetch<RawStatus>(`/devices/${id}/status`),
    stFetch<{ state?: string }>(`/devices/${id}/health`).catch(() => ({ state: "UNKNOWN" })),
    redis().get<boolean>(LAST_DISPLAY_KEY),
  ]);
  const status = normalizeStatus(raw, health.state !== "OFFLINE");
  // O hack via execute não reporta o estado do display; usa o último valor enviado.
  if (status.display === null && typeof lastDisplay === "boolean") status.display = lastDisplay;
  return status;
}

export async function sendCommands(commands: Command[], meta?: { display?: boolean }) {
  if (commands.length === 0) return;
  const { id } = await getDevice();
  await stFetch(`/devices/${id}/commands`, { method: "POST", body: JSON.stringify({ commands }) });
  if (typeof meta?.display === "boolean") await redis().set(LAST_DISPLAY_KEY, meta.display);
}

export async function listDevices() {
  const list = await stFetch<{ items: StDevice[] }>(`/devices`);
  return (list.items ?? []).map(toInfo);
}
