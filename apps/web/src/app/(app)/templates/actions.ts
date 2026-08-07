"use server";

import { requireRole } from "@/lib/auth/dal";
import { enqueueTemplateSync } from "@/lib/queues/template-sync";

export async function triggerTemplateSync(): Promise<void> {
  await requireRole("admin", "supervisor");
  await enqueueTemplateSync();
}
