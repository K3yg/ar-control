import { isAuthorized, unauthorized } from "./auth";
import type { AcStatus } from "./capabilities";
import { errorResponse } from "./errors";
import { isMock, mockApply, mockStatus } from "./mock";
import { findPreset } from "./presets";
import { type DesiredState, buildCommands } from "./schema";
import { displayStrategy, getStatus, sendCommands } from "./smartthings";

export async function readStatus(): Promise<AcStatus> {
  return isMock ? mockStatus() : getStatus();
}

export async function applyState(state: DesiredState) {
  if (isMock) return mockApply(state);
  const commands = buildCommands(state, await displayStrategy());
  await sendCommands(commands, { display: state.power === "off" ? undefined : state.display });
  return { ok: true, applied: state, commands: commands.map((c) => `${c.capability}.${c.command}`) };
}

export async function applyPreset(idOrName: string) {
  const preset = await findPreset(idOrName);
  if (!preset) return null;
  await applyState(preset.state);
  return preset;
}

/** Wraps a handler with the shared-secret check and the standard error handling. */
export function protectedRoute<A extends unknown[]>(handler: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A) => {
    if (!isAuthorized(req)) return unauthorized();
    try {
      return await handler(req, ...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
