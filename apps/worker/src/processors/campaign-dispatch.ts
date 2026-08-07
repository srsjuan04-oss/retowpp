import type { SupabaseClient } from "@supabase/supabase-js";
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { buildCampaignSendJobId, CAMPAIGN_DISPATCH_QUEUE, MESSAGE_SEND_QUEUE } from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";
import { createWorkerSupabaseClient } from "../supabase";

type Client = SupabaseClient<Database>;

const BATCH_SIZE = 50;

/**
 * Orquestador de campaña: pagina `campaign_recipients` en lotes y encola un
 * job `message-send` por destinatario. Es resumible: si se reintenta, solo
 * toma los que sigan en `pending` (los ya encolados quedan en `queued` y no
 * se vuelven a tomar), así que reintentar este job nunca duplica envíos.
 */
export async function processCampaignDispatch(supabase: Client, campaignId: string, messageSendQueue: Queue): Promise<void> {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, status")
    .eq("id", campaignId)
    .single();
  if (error) throw error;
  if (campaign.status === "completed" || campaign.status === "cancelled") return;

  if (campaign.status === "queued") {
    await supabase
      .from("campaigns")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", campaignId);
  }

  let batchIndex = 0;
  for (;;) {
    const { data: pending, error: pendingError } = await supabase
      .from("campaign_recipients")
      .select("id, contact_id")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (pendingError) throw pendingError;
    if (!pending || pending.length === 0) break;

    batchIndex += 1;
    await supabase.from("campaign_batches").insert({
      campaign_id: campaignId,
      batch_index: batchIndex,
      contact_count: pending.length,
      status: "running",
      started_at: new Date().toISOString(),
    });

    await messageSendQueue.addBulk(
      pending.map((recipient) => ({
        name: "send",
        data: { campaignId, contactId: recipient.contact_id },
        opts: {
          jobId: buildCampaignSendJobId(campaignId, recipient.contact_id),
          attempts: 3,
          backoff: { type: "exponential" as const, delay: 5000 },
        },
      })),
    );

    // Se marcan como 'queued' para que un reintento de este dispatch no los vuelva a tomar.
    await supabase
      .from("campaign_recipients")
      .update({ status: "queued" })
      .eq("campaign_id", campaignId)
      .in("id", pending.map((r) => r.id));

    // "completed" aquí significa "el lote quedó encolado", no "entregado":
    // la entrega real de cada mensaje se rastrea por destinatario en campaign_recipients.
    await supabase
      .from("campaign_batches")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("campaign_id", campaignId)
      .eq("batch_index", batchIndex);
  }
}

export function createCampaignDispatchWorker(connection: ConnectionOptions): { worker: Worker; messageSendQueue: Queue } {
  const supabase = createWorkerSupabaseClient();
  const messageSendQueue = new Queue(MESSAGE_SEND_QUEUE, { connection });

  const worker = new Worker(
    CAMPAIGN_DISPATCH_QUEUE,
    async (job: Job<{ campaignId: string }>) => {
      await processCampaignDispatch(supabase, job.data.campaignId, messageSendQueue);
    },
    { connection },
  );

  return { worker, messageSendQueue };
}
