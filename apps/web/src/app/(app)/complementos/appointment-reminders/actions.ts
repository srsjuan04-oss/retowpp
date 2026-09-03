"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
}

const SetTemplateSchema = z.object({
  webhookId: z.uuid(),
  templateId: z.uuid(),
});

/** Asigna la plantilla aprobada por Meta que se usará para este recordatorio de cita. */
export async function setAppointmentReminderTemplate(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireRole("admin");
  const parsed = SetTemplateSchema.safeParse({
    webhookId: formData.get("webhookId"),
    templateId: formData.get("templateId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointment_reminder_webhooks")
    .update({ template_id: parsed.data.templateId })
    .eq("id", parsed.data.webhookId);
  if (error) return { error: error.message };

  revalidatePath("/complementos/appointment-reminders");
  return {};
}

export async function toggleAppointmentReminderActive(webhookId: string, isActive: boolean): Promise<void> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("appointment_reminder_webhooks").update({ is_active: isActive }).eq("id", webhookId);
  if (error) throw error;
  revalidatePath("/complementos/appointment-reminders");
}
