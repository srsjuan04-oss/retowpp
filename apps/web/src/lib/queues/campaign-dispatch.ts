import "server-only";
import { Queue } from "bullmq";
import { CAMPAIGN_DISPATCH_QUEUE } from "@reto-whatsapp/core";
import { getQueueConnection } from "./connection";

let queue: Queue | undefined;

function getCampaignDispatchQueue(): Queue {
  queue ??= new Queue(CAMPAIGN_DISPATCH_QUEUE, { connection: getQueueConnection() });
  return queue;
}

/**
 * La request solo cambia el status de la campaña y encola UN job orquestador;
 * el envío real de mensajes nunca ocurre en esta request (regla obligatoria).
 */
export async function enqueueCampaignDispatch(campaignId: string): Promise<void> {
  await getCampaignDispatchQueue().add(
    "dispatch",
    { campaignId },
    { jobId: campaignId, attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
  );
}
