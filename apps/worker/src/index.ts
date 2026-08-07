import { createRedisConnection } from "./redis";
import { createWorkerSupabaseClient } from "./supabase";
import { createWebhookProcessingWorker } from "./processors/webhook-processing";
import { createContactImportWorker } from "./processors/contact-import";
import { createTemplateSyncWorker, scheduleRecurringTemplateSync } from "./processors/template-sync";
import { createCampaignDispatchWorker } from "./processors/campaign-dispatch";
import { createMessageSendWorker } from "./processors/message-send";
import { createAiAgentReplyWorker } from "./processors/ai-agent-reply";
import { startWebhookEventsSweeper } from "./sweeper";

async function main() {
  const connection = createRedisConnection();
  await connection.ping();

  const supabase = createWorkerSupabaseClient();
  const { worker: webhookProcessingWorker, aiAgentReplyQueue } = createWebhookProcessingWorker(connection);
  const contactImportWorker = createContactImportWorker(connection);
  const templateSyncWorker = createTemplateSyncWorker(connection);
  const templateSyncQueue = await scheduleRecurringTemplateSync(connection);
  const { worker: campaignDispatchWorker, messageSendQueue } = createCampaignDispatchWorker(connection);
  const messageSendWorker = createMessageSendWorker(connection);
  const aiAgentReplyWorker = createAiAgentReplyWorker(connection);
  const stopSweeper = startWebhookEventsSweeper(supabase, aiAgentReplyQueue);

  webhookProcessingWorker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} de webhook-processing falló`, err);
  });
  contactImportWorker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} de contact-import falló`, err);
  });
  templateSyncWorker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} de template-sync falló`, err);
  });
  campaignDispatchWorker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} de campaign-dispatch falló`, err);
  });
  aiAgentReplyWorker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} de ai-agent-reply falló`, err);
  });

  console.log(
    "[worker] listo: webhook-processing, contact-import, template-sync, campaign-dispatch, message-send, ai-agent-reply y barrido de eventos pendientes",
  );

  const shutdown = async () => {
    console.log("[worker] apagando...");
    stopSweeper();
    await Promise.all([
      webhookProcessingWorker.close(),
      aiAgentReplyQueue.close(),
      contactImportWorker.close(),
      templateSyncWorker.close(),
      templateSyncQueue.close(),
      campaignDispatchWorker.close(),
      messageSendQueue.close(),
      messageSendWorker.close(),
      aiAgentReplyWorker.close(),
    ]);
    await connection.quit();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("[worker] error fatal en el arranque", error);
  process.exit(1);
});
