import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AppointmentReminderWebhookItem {
  id: string;
  name: string;
  isActive: boolean;
  templateId: string | null;
  templateName: string;
  phoneNumberLabel: string;
  createdAt: string;
}

/** Dos consultas simples en vez de embedding: ver nota en lib/inbox/queries.ts. */
export async function listAppointmentReminderWebhooks(): Promise<AppointmentReminderWebhookItem[]> {
  const supabase = await createClient();

  const { data: webhooks, error } = await supabase
    .from("appointment_reminder_webhooks")
    .select("id, name, is_active, template_id, phone_number_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!webhooks || webhooks.length === 0) return [];

  const templateIds = [...new Set(webhooks.map((w) => w.template_id).filter((id): id is string => id !== null))];
  const phoneNumberIds = [...new Set(webhooks.map((w) => w.phone_number_id))];

  const [{ data: templates, error: templatesError }, { data: phoneNumbers, error: phoneNumbersError }] = await Promise.all([
    templateIds.length > 0
      ? supabase.from("templates").select("id, name").in("id", templateIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("phone_numbers").select("id, label, display_phone_number").in("id", phoneNumberIds),
  ]);
  if (templatesError) throw templatesError;
  if (phoneNumbersError) throw phoneNumbersError;

  const templateNameById = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const phoneLabelById = new Map((phoneNumbers ?? []).map((p) => [p.id, p.label ?? p.display_phone_number]));

  return webhooks.map((w) => ({
    id: w.id,
    name: w.name,
    isActive: w.is_active,
    templateId: w.template_id,
    templateName: w.template_id ? (templateNameById.get(w.template_id) ?? "—") : "Sin plantilla todavía",
    phoneNumberLabel: phoneLabelById.get(w.phone_number_id) ?? "—",
    createdAt: w.created_at,
  }));
}
