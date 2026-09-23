import { type NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedSalonProRequest } from "@/lib/integrations/salonpro";

const StatusSchema = z.object({
  organization_id: z.uuid(),
  status: z.enum(["trialing", "pending_payment", "active", "past_due", "canceled"]),
});

/**
 * Lo llama un trigger de SalonPro cada vez que cambia el estado de la suscripción de una
 * organización. Solo `canceled` suspende la empresa (nadie de ella puede entrar y el agente
 * de IA deja de responder); `past_due` sigue activa mientras SalonPro reintenta el cobro,
 * igual que allá. Si la suscripción se reactiva, la empresa vuelve a quedar activa.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedSalonProRequest(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = StatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ is_active: parsed.data.status !== "canceled" })
    .eq("salonpro_organization_id", parsed.data.organization_id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: data.length });
}
