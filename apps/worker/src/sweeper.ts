import type { SupabaseClient } from "@supabase/supabase-js";
import type { Queue } from "bullmq";
import type { Database } from "@reto-whatsapp/db";
import { processWebhookEvent } from "./processors/webhook-processing";

const STALE_THRESHOLD_MINUTES = 5;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Cubre el caso en que el encolado de un webhook falla justo después de
 * guardarlo (p. ej. Redis caído un momento): reprocesa directamente en el
 * worker las filas `processed_at IS NULL` con más de 5 minutos de antigüedad,
 * en vez de reencolarlas (evita reconciliar estados de jobs de BullMQ ya
 * fallidos/expirados). `processWebhookEvent` ya es idempotente por sí mismo.
 */
export function startWebhookEventsSweeper(supabase: SupabaseClient<Database>, aiAgentReplyQueue: Queue): () => void {
  const timer = setInterval(() => {
    void sweepOnce(supabase, aiAgentReplyQueue);
  }, SWEEP_INTERVAL_MS);

  return () => clearInterval(timer);
}

async function sweepOnce(supabase: SupabaseClient<Database>, aiAgentReplyQueue: Queue): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60_000).toISOString();
  const { data: staleEvents, error } = await supabase
    .from("webhook_events")
    .select("id")
    .is("processed_at", null)
    .lt("received_at", staleBefore)
    .limit(50);

  if (error) {
    console.error("[sweeper] error listando webhook_events pendientes", error);
    return;
  }

  for (const { id } of staleEvents ?? []) {
    try {
      await processWebhookEvent(supabase, id, aiAgentReplyQueue);
    } catch (processingError) {
      console.error(`[sweeper] error reprocesando webhook_event ${id}`, processingError);
    }
  }
}
