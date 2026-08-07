import "server-only";
import { Queue } from "bullmq";
import { CONTACT_IMPORT_QUEUE } from "@reto-whatsapp/core";
import { getQueueConnection } from "./connection";

let queue: Queue | undefined;

function getContactImportQueue(): Queue {
  queue ??= new Queue(CONTACT_IMPORT_QUEUE, { connection: getQueueConnection() });
  return queue;
}

/** El worker procesa el CSV en segundo plano; la request solo sube el archivo y encola. */
export async function enqueueContactImport(contactImportId: string): Promise<void> {
  await getContactImportQueue().add(
    "process",
    { contactImportId },
    { jobId: contactImportId, attempts: 3, backoff: { type: "exponential", delay: 5000 } },
  );
}
