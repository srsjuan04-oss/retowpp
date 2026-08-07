import "server-only";
import { Queue } from "bullmq";
import { WEBHOOK_PROCESSING_QUEUE } from "@reto-whatsapp/core";
import { getQueueConnection } from "./connection";

let queue: Queue | undefined;

function getWebhookProcessingQueue(): Queue {
  queue ??= new Queue(WEBHOOK_PROCESSING_QUEUE, { connection: getQueueConnection() });
  return queue;
}

/**
 * Encola el procesamiento de un webhook ya guardado en `webhook_events`.
 * `jobId = webhookEventId` hace que reintentar el encolado (p. ej. si el
 * sweeper del worker lo recoge también) nunca produzca un job duplicado.
 */
export async function enqueueWebhookProcessing(webhookEventId: string): Promise<void> {
  await getWebhookProcessingQueue().add(
    "process",
    { webhookEventId },
    { jobId: webhookEventId, attempts: 5, backoff: { type: "exponential", delay: 2000 } },
  );
}
