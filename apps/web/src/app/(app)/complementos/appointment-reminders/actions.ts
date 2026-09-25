"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireRole } from "@/lib/auth/dal";
import { friendlyDbError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  saved?: boolean;
}

// Posición fija de las variables que manda salon-pro: {{1}} nombre del cliente,
// {{2}} servicio, {{3}} barbero, {{4}} hora. Las plantillas deben seguir este orden.
const DEFAULT_VARIABLE_MAPPING = {
  "1": "{{appt.customer_name}}",
  "2": "{{appt.service_name}}",
  "3": "{{appt.barber_name}}",
  "4": "{{appt.time}}",
};

const SenderSchema = z.object({
  phoneNumberId: z.uuid({ error: "Elige el número desde el que se envía." }),
  templateId: z.uuid({ error: "Elige una plantilla." }),
});

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Meta solo deja enviar una plantilla desde un número de su misma WABA. */
async function ensureSameWaba(supabase: Supabase, phoneNumberId: string, templateId: string): Promise<string | null> {
  const [{ data: phone }, { data: template }] = await Promise.all([
    supabase.from("phone_numbers").select("waba_account_id").eq("id", phoneNumberId).maybeSingle(),
    supabase.from("templates").select("waba_account_id").eq("id", templateId).maybeSingle(),
  ]);
  if (!phone || !template) return "No se encontró el número o la plantilla.";
  if (phone.waba_account_id !== template.waba_account_id) {
    return "Esa plantilla es de otra cuenta de WhatsApp: elige una creada en la cuenta del número.";
  }
  return null;
}

const CreateSchema = SenderSchema.extend({
  name: z.string().trim().min(1, { error: "El nombre es obligatorio." }),
});

/** Crea un recordatorio nuevo (otra URL) para pegar en otro recordatorio de salon-pro, ej. 1 hora antes. */
export async function createAppointmentReminderWebhook(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const session = await requireRole("admin");
  const parsed = CreateSchema.safeParse({
    name: formData.get("name"),
    phoneNumberId: formData.get("phoneNumberId"),
    templateId: formData.get("templateId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (!session.companyId) return { error: "Tu usuario no pertenece a ninguna empresa." };

  const supabase = await createClient();
  const mismatch = await ensureSameWaba(supabase, parsed.data.phoneNumberId, parsed.data.templateId);
  if (mismatch) return { error: mismatch };

  const { error } = await supabase.from("appointment_reminder_webhooks").insert({
    name: parsed.data.name,
    phone_number_id: parsed.data.phoneNumberId,
    template_id: parsed.data.templateId,
    variable_mapping: DEFAULT_VARIABLE_MAPPING,
    created_by: session.id,
    company_id: session.companyId,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/complementos/appointment-reminders");
  return {};
}

const UpdateSenderSchema = SenderSchema.extend({ webhookId: z.uuid() });

/**
 * Cambia número y plantilla juntos (van de la mano por la WABA). La URL no cambia,
 * así que en salon-pro no hay que volver a pegar nada.
 */
export async function setAppointmentReminderSender(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireRole("admin");
  const parsed = UpdateSenderSchema.safeParse({
    webhookId: formData.get("webhookId"),
    phoneNumberId: formData.get("phoneNumberId"),
    templateId: formData.get("templateId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const mismatch = await ensureSameWaba(supabase, parsed.data.phoneNumberId, parsed.data.templateId);
  if (mismatch) return { error: mismatch };

  const { error } = await supabase
    .from("appointment_reminder_webhooks")
    .update({ phone_number_id: parsed.data.phoneNumberId, template_id: parsed.data.templateId })
    .eq("id", parsed.data.webhookId);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/complementos/appointment-reminders");
  return { saved: true };
}

export async function toggleAppointmentReminderActive(webhookId: string, isActive: boolean): Promise<void> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("appointment_reminder_webhooks").update({ is_active: isActive }).eq("id", webhookId);
  if (error) throw error;
  revalidatePath("/complementos/appointment-reminders");
}
