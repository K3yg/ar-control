import { Redis } from "@upstash/redis";

let client: Redis | undefined;

// Aceita tanto os nomes UPSTASH_* quanto os KV_* que a integração da Vercel cria.
export function redis(): Redis {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error("Redis não configurado (UPSTASH_REDIS_REST_URL/TOKEN)");
    client = new Redis({ url, token });
  }
  return client;
}
