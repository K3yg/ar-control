import { isAuthorized, unauthorized } from "./auth";
import { errorResponse } from "./errors";
import { type DesiredState, buildCommands } from "./schema";
import { displayStrategy, sendCommands } from "./smartthings";

export async function applyState(state: DesiredState) {
  const commands = buildCommands(state, await displayStrategy());
  await sendCommands(commands, { display: state.power === "off" ? undefined : state.display });
  return { ok: true, applied: state, commands: commands.map((c) => `${c.capability}.${c.command}`) };
}

/** Envolve um handler com checagem do segredo e tratamento de erro padrão. */
export function protectedRoute<A extends unknown[]>(
  handler: (req: Request, ...args: A) => Promise<Response>,
) {
  return async (req: Request, ...args: A) => {
    if (!isAuthorized(req)) return unauthorized();
    try {
      return await handler(req, ...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
