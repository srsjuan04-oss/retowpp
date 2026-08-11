import { type NextRequest, NextResponse } from "next/server";
import type { HotmartWebhookPayload } from "@reto-whatsapp/core";
import type { Json } from "@reto-whatsapp/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueHotmartWebhook } from "@/lib/queues/hotmart-webhook";

/**
 * Receptor de webhooks de Hotmart. La seguridad es la URL en sí: cada
 * "receta" (evento -> plantilla) de `hotmart_webhooks` tiene un id
 * (uuid, no adivinable) que es el único segmento de la URL — mismo modelo
 * que usa Whapify. No hay firma HMAC como en Meta porque Hotmart no la ofrece
 * en su formato de webhook estándar.
 *
 * Guarda el payload crudo en `hotmart_webhook_events` ANTES de encolar el
 * procesamiento real (mismo patrón que `/api/webhooks/whatsapp`), y responde
 * rápido para que Hotmart no reintente por timeout.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
  const { webhookId } = await params;

  const supabase = createAdminClient();
  const { data: config } = await supabase
    .from("hotmart_webhooks")
    .select("id, event, is_active")
    .eq("id", webhookId)
    .maybeSingle();
  if (!config || !config.is_active) {
    return new NextResponse("Not found", { status: 404 });
  }

  let payload: HotmartWebhookPayload;
  try {
    payload = (await request.json()) as HotmartWebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const receivedEvent = payload.event ?? "unknown";

  const { data: inserted, error } = await supabase
    .from("hotmart_webhook_events")
    .insert({
      hotmart_webhook_id: config.id,
      event: receivedEvent,
      payload: payload as unknown as Json,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[webhook-hotmart] error guardando hotmart_webhook_events", error);
    return new NextResponse("Internal Error", { status: 500 });
  }

  // El evento recibido no coincide con el configurado para esta receta (p. ej.
  // el usuario activó más eventos del lado de Hotmart de los que pidió acá):
  // se deja el registro para auditoría, pero no se dispara ningún mensaje.
  if (receivedEvent !== config.event) {
    await supabase
      .from("hotmart_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: `Evento no coincide: se esperaba ${config.event}` })
      .eq("id", inserted.id);
    return new NextResponse("OK (evento ignorado)", { status: 200 });
  }

  await enqueueHotmartWebhook(inserted.id);
  return new NextResponse("OK", { status: 200 });
}
