import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { readCookie } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { exchangeCode } from "@/lib/tokens";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const expected = readCookie(req, "st_oauth_state") ?? "";
  const home = new URL("/", url.origin);

  const stateOk =
    !!expected && state.length === expected.length && timingSafeEqual(Buffer.from(state), Buffer.from(expected));
  if (!code || !stateOk) {
    home.searchParams.set("auth", "invalid_state");
    return NextResponse.redirect(home);
  }

  try {
    await exchangeCode(code);
    await redis().del("st:device"); // redescobre o aparelho com o novo login
    home.searchParams.set("auth", "ok");
  } catch (e) {
    console.error("[auth] troca de code falhou:", e instanceof Error ? e.message : e);
    home.searchParams.set("auth", "error");
  }
  const res = NextResponse.redirect(home);
  res.cookies.delete("st_oauth_state");
  return res;
}
