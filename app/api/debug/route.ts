import { protectedRoute } from "@/lib/ac";
import { readTokens } from "@/lib/tokens";
import { displayStrategy, getDevice, getRawStatus, listDevices } from "@/lib/smartthings";

/** Descoberta (Fase 0): aparelhos da conta, aparelho escolhido, capabilities e status bruto. Sem tokens. */
export const GET = protectedRoute(async () => {
  const t = await readTokens();
  const [devices, device] = await Promise.all([listDevices(), getDevice()]);
  const [raw, display] = await Promise.all([getRawStatus(), displayStrategy()]);
  return Response.json({
    tokens: t && {
      expiresAt: new Date(t.expiresAt).toISOString(),
      refreshedAt: new Date(t.refreshedAt).toISOString(),
    },
    devices,
    selected: device,
    displayStrategy: display,
    status: raw,
  });
});
