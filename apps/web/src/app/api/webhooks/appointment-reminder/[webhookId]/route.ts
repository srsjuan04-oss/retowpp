import { type NextRequest, NextResponse } from "next/server";
import type { AppointmentReminderPayload } from "@reto-whatsapp/core";
import type { Json } from "@reto-whatsapp/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAppointmentReminder } from "@/lib/queues/appointment-reminder";

/**
 * Receptor de recordatorios de cita desde salon-pro (el CRM). Misma seguridad
 * que el receptor de Hotmart: el id (uuid, no adivinable) de la receta en
 * `appointment_reminder_webhooks` es el único segmento de la URL — eso es lo
 * que se pega en la configuración de salon-pro, no hace falta un token aparte.
 *
 * A diferencia de Hotmart, el payload ya llega limpio (salon-pro es nuestro
 * propio CRM, no un proveedor externo con su propio formato), así que se
 * guarda tal cual y se encola.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Asigna la plantilla desde afuera (panel de salon-pro), misma seguridad que el POST: el uuid en la URL. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
  const { webhookId } = await params;

  let body: { templateId?: string };
  try {
    body = (await request.json()) as { templateId?: string };
  } catch {
    return new NextResponse("Invalid JSON", { status: 400, headers: CORS_HEADERS });
  }
  if (!body.templateId) {
    return new NextResponse("Falta templateId", { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createAdminClient();
  const { data: updated, error } = await supabase
    .from("appointment_reminder_webhooks")
    .update({ template_id: body.templateId })
    .eq("id", webhookId)
    .select("id, template_id")
    .maybeSingle();

  if (error) {
    return new NextResponse("Internal Error", { status: 500, headers: CORS_HEADERS });
  }
  if (!updated) {
    return new NextResponse("Not found", { status: 404, headers: CORS_HEADERS });
  }

  return NextResponse.json(updated, { headers: CORS_HEADERS });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
  const { webhookId } = await params;

  const supabase = createAdminClient();
  const { data: config } = await supabase
    .from("appointment_reminder_webhooks")
    .select("id, is_active")
    .eq("id", webhookId)
    .maybeSingle();
  if (!config || !config.is_active) {
    return new NextResponse("Not found", { status: 404 });
  }

  let payload: AppointmentReminderPayload;
  try {
    payload = (await request.json()) as AppointmentReminderPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  if (!payload.phone) {
    return new NextResponse("Falta el teléfono del cliente", { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from("appointment_reminder_events")
    .insert({
      appointment_reminder_webhook_id: config.id,
      payload: payload as unknown as Json,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[webhook-appointment-reminder] error guardando appointment_reminder_events", error);
    return new NextResponse("Internal Error", { status: 500 });
  }

  await enqueueAppointmentReminder(inserted.id);
  return new NextResponse("OK", { status: 200 });
}
