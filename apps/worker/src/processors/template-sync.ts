import type { SupabaseClient } from "@supabase/supabase-js";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { TEMPLATE_SYNC_QUEUE, WhatsAppClient, decryptWabaToken, type MetaTemplateApiItem } from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";
import { createWorkerSupabaseClient } from "../supabase";

type Client = SupabaseClient<Database>;

const RECURRING_JOB_ID = "template-sync-recurring";
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // cada 6 horas

function mapTemplateStatus(status: MetaTemplateApiItem["status"]): Database["public"]["Enums"]["template_status"] {
  return status.toLowerCase() as Database["public"]["Enums"]["template_status"];
}

async function syncWabaTemplates(
  supabase: Client,
  wabaAccountId: string,
  wabaId: string,
  accessTokenEncrypted: string,
): Promise<void> {
  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("Falta configurar WABA_TOKEN_ENCRYPTION_KEY en el servidor.");

  const client = new WhatsAppClient({
    accessToken: decryptWabaToken(accessTokenEncrypted, encryptionKey),
    ...(process.env.META_GRAPH_API_VERSION ? { graphApiVersion: process.env.META_GRAPH_API_VERSION } : {}),
    ...(process.env.META_APP_SECRET ? { appSecret: process.env.META_APP_SECRET } : {}),
  });

  const templates = await client.fetchApprovedTemplates(wabaId);
  const now = new Date().toISOString();

  for (const template of templates) {
    await supabase.from("templates").upsert(
      {
        waba_account_id: wabaAccountId,
        meta_template_id: template.id,
        name: template.name,
        language: template.language,
        category: template.category,
        status: mapTemplateStatus(template.status),
        components: template.components,
        last_synced_at: now,
      },
      { onConflict: "waba_account_id,name,language" },
    );
  }
}

/** Sincroniza las plantillas de todas las WABA activas (módulo 11). */
export async function syncAllTemplates(supabase: Client): Promise<void> {
  const { data: wabaAccounts, error } = await supabase
    .from("waba_accounts")
    .select("id, waba_id, access_token_encrypted")
    .eq("is_active", true);
  if (error) throw error;

  for (const account of wabaAccounts ?? []) {
    await syncWabaTemplates(supabase, account.id, account.waba_id, account.access_token_encrypted);
  }
}

export function createTemplateSyncWorker(connection: ConnectionOptions) {
  const supabase = createWorkerSupabaseClient();
  return new Worker(
    TEMPLATE_SYNC_QUEUE,
    async () => {
      await syncAllTemplates(supabase);
    },
    { connection },
  );
}

/** Programa el job recurrente además de aceptar disparos manuales desde el admin. */
export async function scheduleRecurringTemplateSync(connection: ConnectionOptions): Promise<Queue> {
  const queue = new Queue(TEMPLATE_SYNC_QUEUE, { connection });
  await queue.add(
    "sync",
    {},
    { jobId: RECURRING_JOB_ID, repeat: { every: SYNC_INTERVAL_MS } },
  );
  return queue;
}
