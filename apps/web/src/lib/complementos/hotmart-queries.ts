import "server-only";
import type { HotmartEvent } from "@reto-whatsapp/db";
import { createClient } from "@/lib/supabase/server";

export interface HotmartWebhookItem {
  id: string;
  name: string;
  event: HotmartEvent;
  isActive: boolean;
  templateName: string;
  phoneNumberLabel: string;
  createdAt: string;
}

/** Dos consultas simples en vez de embedding: ver nota en lib/inbox/queries.ts. */
export async function listHotmartWebhooks(): Promise<HotmartWebhookItem[]> {
  const supabase = await createClient();

  const { data: webhooks, error } = await supabase
    .from("hotmart_webhooks")
    .select("id, name, event, is_active, template_id, phone_number_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!webhooks || webhooks.length === 0) return [];

  const templateIds = [...new Set(webhooks.map((w) => w.template_id))];
  const phoneNumberIds = [...new Set(webhooks.map((w) => w.phone_number_id))];

  const [{ data: templates, error: templatesError }, { data: phoneNumbers, error: phoneNumbersError }] = await Promise.all([
    supabase.from("templates").select("id, name").in("id", templateIds),
    supabase.from("phone_numbers").select("id, label, display_phone_number").in("id", phoneNumberIds),
  ]);
  if (templatesError) throw templatesError;
  if (phoneNumbersError) throw phoneNumbersError;

  const templateNameById = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const phoneLabelById = new Map((phoneNumbers ?? []).map((p) => [p.id, p.label ?? p.display_phone_number]));

  return webhooks.map((w) => ({
    id: w.id,
    name: w.name,
    event: w.event,
    isActive: w.is_active,
    templateName: templateNameById.get(w.template_id) ?? "—",
    phoneNumberLabel: phoneLabelById.get(w.phone_number_id) ?? "—",
    createdAt: w.created_at,
  }));
}

export interface HotmartWebhookEventItem {
  id: string;
  event: string;
  receivedAt: string;
  processedAt: string | null;
  processingError: string | null;
  webhookName: string | null;
  payload: Record<string, unknown>;
}

/** Log de eventos crudos recibidos (módulo complementos), para diagnóstico. */
export async function listHotmartWebhookEvents(limit = 100): Promise<HotmartWebhookEventItem[]> {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from("hotmart_webhook_events")
    .select("id, event, received_at, processed_at, processing_error, hotmart_webhook_id, payload")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!events || events.length === 0) return [];

  const webhookIds = [...new Set(events.map((e) => e.hotmart_webhook_id).filter((id): id is string => id !== null))];
  const { data: webhooks, error: webhooksError } =
    webhookIds.length > 0
      ? await supabase.from("hotmart_webhooks").select("id, name").in("id", webhookIds)
      : { data: [], error: null };
  if (webhooksError) throw webhooksError;
  const nameById = new Map((webhooks ?? []).map((w) => [w.id, w.name]));

  return events.map((e) => ({
    id: e.id,
    event: e.event,
    receivedAt: e.received_at,
    processedAt: e.processed_at,
    processingError: e.processing_error,
    webhookName: e.hotmart_webhook_id ? (nameById.get(e.hotmart_webhook_id) ?? null) : null,
    payload: e.payload as unknown as Record<string, unknown>,
  }));
}
