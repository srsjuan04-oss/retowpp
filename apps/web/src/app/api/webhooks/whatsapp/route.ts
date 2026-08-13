import { type NextRequest, NextResponse } from "next/server";
import { buildWebhookDedupeKey, verifyMetaWebhookSignature, type WhatsAppWebhookPayload } from "@reto-whatsapp/core";
import type { Json } from "@reto-whatsapp/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueWebhookProcessing } from "@/lib/queues/webhook-processing";

/**
 * Reto de configuración de webhooks de Meta: responde al challenge de
 * verificación (hub.mode/hub.verify_token/hub.challenge) al conectar la URL
 * en el panel de WhatsApp Cloud API.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Receptor de eventos de WhatsApp Cloud API. Reglas obligatorias implementadas:
 * - Guarda el payload crudo en `webhook_events` ANTES de cualquier procesamiento.
 * - Nunca procesa dos veces la misma entrega (dedupe_key = hash del body exacto).
 * - Rechaza (401) los payloads con firma inválida sin procesarlos, aunque los
 *   guarda igual para auditoría.
 * - El procesamiento real (idempotente por wamid) ocurre en el worker; aquí
 *   solo se guarda y se encola.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");
  const signatureValid = verifyMetaWebhookSignature({
    rawBody,
    signatureHeader,
    appSecret: process.env.META_APP_SECRET!,
  });

  let payload: WhatsAppWebhookPayload | undefined;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    // Cuerpo no es JSON válido; se guarda igual crudo, marcado como inválido más abajo.
  }

  const dedupeKey = buildWebhookDedupeKey(rawBody);
  const wabaId = payload?.entry?.[0]?.id;
  const eventType = payload?.entry?.[0]?.changes?.[0]?.field ?? "unknown";

  const supabase = createAdminClient();

  let wabaAccountId: string | null = null;
  let companyId: string | null = null;
  if (wabaId) {
    const { data } = await supabase.from("waba_accounts").select("id, company_id").eq("waba_id", wabaId).maybeSingle();
    wabaAccountId = data?.id ?? null;
    companyId = data?.company_id ?? null;
  }

  const { data: inserted, error } = await supabase
    .from("webhook_events")
    .upsert(
      {
        waba_account_id: wabaAccountId,
        company_id: companyId,
        event_type: eventType,
        // Se guarda tal cual llega de Meta; el tipado fuerte de WhatsAppWebhookPayload
        // es solo para el código que lo interpreta, no restringe lo que cabe en jsonb.
        payload: (payload ?? { raw: rawBody }) as unknown as Json,
        signature_valid: signatureValid,
        dedupe_key: dedupeKey,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    // No pudimos ni siquiera guardar el evento: se responde con error para que
    // Meta reintente la entrega más tarde (nunca se descarta silenciosamente).
    console.error("[webhook] error guardando webhook_events", error);
    return new NextResponse("Internal Error", { status: 500 });
  }

  if (!signatureValid) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  if (inserted) {
    // Fila nueva (no era una entrega duplicada): se encola el procesamiento real.
    await enqueueWebhookProcessing(inserted.id);
  }

  return new NextResponse("OK", { status: 200 });
}
