import { applyState, protectedRoute } from "@/lib/ac";

export const POST = protectedRoute(async () => Response.json(await applyState({ power: "off" })));
