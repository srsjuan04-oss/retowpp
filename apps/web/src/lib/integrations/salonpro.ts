import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Las rutas de /api/integrations/salonpro solo las llama el backend de SalonPro (edge
 * functions y un trigger con pg_net), nunca un navegador. Se autentican con un secreto
 * compartido en el header `x-provisioning-secret` (SALONPRO_PROVISIONING_SECRET acá y en
 * los secretos/Vault de SalonPro).
 */
export function isAuthorizedSalonProRequest(request: NextRequest): boolean {
  const expected = process.env.SALONPRO_PROVISIONING_SECRET;
  const received = request.headers.get("x-provisioning-secret");
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
