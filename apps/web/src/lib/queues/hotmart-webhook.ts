import "server-only";
import { Queue } from "bullmq";
import { HOTMART_WEBHOOK_QUEUE } from "@reto-whatsapp/core";
import { getQueueConnection } from "./connection";

let queue: Queue | undefined;

function getHotmartWebhookQueue(): Queue {
  queue ??= new Queue(HOTMART_WEBHOOK_QUEUE, { connection: getQueueConnection() });
  return queue;
}

/**
 * Encola el procesamiento de un evento de Hotmart ya guardado en
 * `hotmart_webhook_events`. `jobId = eventId` evita duplicar el job si el
 * receptor se reintenta (p. ej. Hotmart reentrega la misma notificación).
 */
export async function enqueueHotmartWebhook(eventId: string): Promise<void> {
  await getHotmartWebhookQueue().add(
    "process",
    { eventId },
    { jobId: eventId, attempts: 5, backoff: { type: "exponential", delay: 2000 } },
  );
}
