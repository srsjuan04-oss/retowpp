import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lista las plantillas aprobadas del WABA que usa este recordatorio, para que
 * salon-pro pueda mostrarlas en su propio panel sin tener que entrar a Chat
 * CharlIA. Misma seguridad que el receptor (POST en la ruta hermana): el id
 * (uuid, no adivinable) de la receta es el único segmento de la URL.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
  const { webhookId } = await params;
  const supabase = createAdminClient();

  const { data: config } = await supabase
    .from("appointment_reminder_webhooks")
    .select("id, template_id, phone_number_id")
    .eq("id", webhookId)
    .maybeSingle();
  if (!config) {
    return new NextResponse("Not found", { status: 404, headers: CORS_HEADERS });
  }

  const { data: phoneNumber } = await supabase
    .from("phone_numbers")
    .select("waba_account_id")
    .eq("id", config.phone_number_id)
    .single();
  if (!phoneNumber) {
    return new NextResponse("Not found", { status: 404, headers: CORS_HEADERS });
  }

  const { data: templates, error } = await supabase
    .from("templates")
    .select("id, name, language")
    .eq("waba_account_id", phoneNumber.waba_account_id)
    .eq("status", "approved")
    .order("name");
  if (error) {
    return new NextResponse("Internal Error", { status: 500, headers: CORS_HEADERS });
  }

  return NextResponse.json(
    { templates: templates ?? [], currentTemplateId: config.template_id },
    { headers: CORS_HEADERS },
  );
}
