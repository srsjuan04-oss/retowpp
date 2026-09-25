import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AppointmentReminderWebhookItem {
  id: string;
  name: string;
  isActive: boolean;
  templateId: string | null;
  templateName: string;
  phoneNumberId: string;
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
    phoneNumberId: w.phone_number_id,
    phoneNumberLabel: phoneLabelById.get(w.phone_number_id) ?? "—",
    createdAt: w.created_at,
  }));
}

export interface ReminderSenderOption {
  id: string;
  label: string;
  wabaAccountId: string;
}

export interface ReminderTemplateOption {
  id: string;
  name: string;
  language: string;
  wabaAccountId: string;
}

/**
 * Números y plantillas para armar un recordatorio. Una plantilla solo se puede enviar
 * desde un número de su misma WABA, así que ambos llevan wabaAccountId para filtrar.
 * El nombre de la WABA va en la etiqueta porque un mismo número puede estar en dos
 * WABA distintas (ej. al migrarlo de cuenta) y sin eso se ven idénticos.
 */
export async function listReminderSenderOptions(): Promise<{
  phoneNumbers: ReminderSenderOption[];
  templates: ReminderTemplateOption[];
}> {
  const supabase = await createClient();

  const [{ data: phones, error: phonesError }, { data: templates, error: templatesError }, { data: wabas, error: wabasError }] =
    await Promise.all([
      supabase.from("phone_numbers").select("id, label, display_phone_number, waba_account_id").eq("is_active", true),
      supabase.from("templates").select("id, name, language, waba_account_id").eq("status", "approved").order("name"),
      supabase.from("waba_accounts").select("id, business_name, is_active"),
    ]);
  if (phonesError) throw phonesError;
  if (templatesError) throw templatesError;
  if (wabasError) throw wabasError;

  const activeWabaName = new Map((wabas ?? []).filter((w) => w.is_active).map((w) => [w.id, w.business_name]));

  return {
    phoneNumbers: (phones ?? [])
      .filter((p) => activeWabaName.has(p.waba_account_id))
      .map((p) => ({
        id: p.id,
        label: `${p.label ?? p.display_phone_number} · ${activeWabaName.get(p.waba_account_id) ?? "—"}`,
        wabaAccountId: p.waba_account_id,
      })),
    templates: (templates ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      language: t.language,
      wabaAccountId: t.waba_account_id,
    })),
  };
}
