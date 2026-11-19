export type AcErrorCode =
  | "needs_reauth"
  | "offline"
  | "rate_limited"
  | "timeout"
  | "smartthings"
  | "no_device";

export class AcError extends Error {
  constructor(public code: AcErrorCode, message: string, public status = 502) {
    super(message);
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof AcError) {
    return Response.json(
      { error: e.code, message: e.message, needsReauth: e.code === "needs_reauth" },
      { status: e.status },
    );
  }
  console.error("[ac] erro inesperado:", e instanceof Error ? e.message : e);
  return Response.json({ error: "internal", message: "Erro interno" }, { status: 500 });
}
