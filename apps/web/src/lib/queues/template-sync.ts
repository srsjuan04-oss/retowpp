import "server-only";
import { Queue } from "bullmq";
import { TEMPLATE_SYNC_QUEUE } from "@reto-whatsapp/core";
import { getQueueConnection } from "./connection";

let queue: Queue | undefined;

function getTemplateSyncQueue(): Queue {
  queue ??= new Queue(TEMPLATE_SYNC_QUEUE, { connection: getQueueConnection() });
  return queue;
}

/** Disparo manual de sincronización, además del job recurrente que programa el worker. */
export async function enqueueTemplateSync(): Promise<void> {
  await getTemplateSyncQueue().add("sync", {});
}
