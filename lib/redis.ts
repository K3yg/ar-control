import { Redis } from "@upstash/redis";

type Store = Pick<Redis, "get" | "set" | "del" | "eval">;

let client: Store | undefined;

// Accepts both UPSTASH_* and the KV_* names the Vercel integration creates.
// In dev without Redis, falls back to an in-memory store.
export function redis(): Store {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (url && token) client = new Redis({ url, token });
    else if (process.env.NODE_ENV !== "production") client = memoryStore();
    else throw new Error("Redis is not configured (UPSTASH_REDIS_REST_URL/TOKEN)");
  }
  return client;
}

function memoryStore(): Store {
  const g = globalThis as unknown as { __acMem?: Map<string, { v: unknown; exp?: number }> };
  const m = (g.__acMem ??= new Map());
  const live = (k: string) => {
    const e = m.get(k);
    if (e?.exp && e.exp < Date.now()) m.delete(k);
    return m.get(k);
  };
  const store = {
    async get(k: string) {
      return live(k)?.v ?? null;
    },
    async set(k: string, v: unknown, o?: { nx?: boolean; px?: number; ex?: number }) {
      if (o?.nx && live(k)) return null;
      const ttl = o?.px ?? (o?.ex ? o.ex * 1000 : undefined);
      m.set(k, { v, exp: ttl ? Date.now() + ttl : undefined });
      return "OK";
    },
    async del(...keys: string[]) {
      let n = 0;
      for (const k of keys) if (m.delete(k)) n++;
      return n;
    },
    // Only the lock-release script is used.
    async eval(_s: string, keys: string[], args: unknown[]) {
      if (live(keys[0])?.v === args[0]) return m.delete(keys[0]) ? 1 : 0;
      return 0;
    },
  };
  return store as unknown as Store;
}
