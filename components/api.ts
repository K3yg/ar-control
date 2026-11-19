export type Status = {
  power: "on" | "off" | null;
  mode: string | null;
  modes: string[];
  targetTemp: number | null;
  minTemp: number;
  maxTemp: number;
  currentTemp: number | null;
  humidity: number | null;
  fanMode: string | null;
  fanModes: string[];
  availableFanModes: string[];
  swing: string | null;
  swingModes: string[];
  optionalMode: string | null;
  windFree: boolean | null;
  display: boolean | null;
  watts: number | null;
  energyKwh: number | null;
  online: boolean;
};


export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message ?? "Request failed"), { data, status: res.status });
  return data as T;
}

