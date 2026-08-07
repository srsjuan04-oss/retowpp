import "server-only";
import type { CampaignStatus, Database } from "@reto-whatsapp/db";
import { createClient } from "@/lib/supabase/server";

export interface AudienceFilter {
  includeTagIds: string[];
  excludeTagIds: string[];
}

export interface AudienceContact {
  id: string;
  waId: string;
  displayName: string | null;
  customFields: Record<string, unknown>;
}

/**
 * Filtro por etiquetas (módulo 14) + exclusión por etiquetas (módulo 15).
 * Excluye siempre a quien no esté `subscribed` (regla obligatoria: nunca
 * enviar a contactos retirados, bloqueados o sin autorización).
 */
export async function previewAudience(filter: AudienceFilter): Promise<AudienceContact[]> {
  const supabase = await createClient();

  let includedContactIds: string[] | null = null;
  if (filter.includeTagIds.length > 0) {
    const { data: included, error } = await supabase
      .from("contact_tags")
      .select("contact_id")
      .in("tag_id", filter.includeTagIds);
    if (error) throw error;
    includedContactIds = [...new Set((included ?? []).map((r) => r.contact_id))];
    if (includedContactIds.length === 0) return [];
  }

  let query = supabase.from("contacts").select("id, wa_id, display_name, custom_fields").eq("consent_status", "subscribed");
  if (includedContactIds) query = query.in("id", includedContactIds);
  const { data: contacts, error: contactsError } = await query;
  if (contactsError) throw contactsError;
  if (!contacts || contacts.length === 0) return [];

  let excludedIds = new Set<string>();
  if (filter.excludeTagIds.length > 0) {
    const { data: excluded, error } = await supabase
      .from("contact_tags")
      .select("contact_id")
      .in("tag_id", filter.excludeTagIds);
    if (error) throw error;
    excludedIds = new Set((excluded ?? []).map((r) => r.contact_id));
  }

  return contacts
    .filter((c) => !excludedIds.has(c.id))
    .map((c) => ({
      id: c.id,
      waId: c.wa_id,
      displayName: c.display_name,
      customFields: c.custom_fields as unknown as Record<string, unknown>,
    }));
}

export interface CampaignListItem {
  id: string;
  name: string;
  status: CampaignStatus;
  createdAt: string;
}

export async function listCampaigns(): Promise<CampaignListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status, createdAt: c.created_at }));
}

export interface CampaignDetail {
  id: string;
  name: string;
  status: CampaignStatus;
  templateId: string;
  phoneNumberId: string;
  variableMapping: Record<string, string>;
  audienceFilter: AudienceFilter;
  stats: Record<string, unknown>;
}

export async function getCampaign(campaignId: string): Promise<CampaignDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, status, template_id, phone_number_id, variable_mapping, audience_filter, stats")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const rawFilter = data.audience_filter as Partial<AudienceFilter>;
  return {
    id: data.id,
    name: data.name,
    status: data.status,
    templateId: data.template_id,
    phoneNumberId: data.phone_number_id,
    variableMapping: data.variable_mapping as unknown as Record<string, string>,
    audienceFilter: {
      includeTagIds: rawFilter.includeTagIds ?? [],
      excludeTagIds: rawFilter.excludeTagIds ?? [],
    },
    stats: data.stats as unknown as Record<string, unknown>,
  };
}

export interface CampaignRecipientStats {
  pending: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  total: number;
}

export async function getCampaignRecipientStats(campaignId: string): Promise<CampaignRecipientStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaign_recipients").select("status").eq("campaign_id", campaignId);
  if (error) throw error;

  const stats: CampaignRecipientStats = {
    pending: 0,
    queued: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    skipped: 0,
    total: data?.length ?? 0,
  };
  for (const row of data ?? []) {
    stats[row.status] += 1;
  }
  return stats;
}

export interface CampaignRecipientItem {
  id: string;
  contactId: string;
  phoneNumberSnapshot: string;
  status: Database["public"]["Enums"]["campaign_recipient_status"];
  skipReason: string | null;
  error: { message?: string } | null;
  updatedAt: string;
}

/** Detalle por destinatario: para responder "¿a este número le llegó o no?" sin adivinar a partir de los conteos agregados. */
export async function listCampaignRecipients(campaignId: string): Promise<CampaignRecipientItem[]> {
  const supabase = await createClient();
  const { data: recipients, error } = await supabase
    .from("campaign_recipients")
    .select("id, contact_id, phone_number_snapshot, status, skip_reason, message_id, updated_at")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  if (!recipients || recipients.length === 0) return [];

  const messageIds = recipients.map((r) => r.message_id).filter((id): id is string => id !== null);
  let errorByMessageId = new Map<string, { message?: string } | null>();
  if (messageIds.length > 0) {
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id, error")
      .in("id", messageIds);
    if (messagesError) throw messagesError;
    errorByMessageId = new Map((messages ?? []).map((m) => [m.id, m.error as { message?: string } | null]));
  }

  return recipients.map((r) => ({
    id: r.id,
    contactId: r.contact_id,
    phoneNumberSnapshot: r.phone_number_snapshot,
    status: r.status,
    skipReason: r.skip_reason,
    error: r.message_id ? (errorByMessageId.get(r.message_id) ?? null) : null,
    updatedAt: r.updated_at,
  }));
}

export interface PhoneNumberOption {
  id: string;
  label: string;
}

export async function listActivePhoneNumbers(): Promise<PhoneNumberOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("phone_numbers")
    .select("id, display_phone_number, label")
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, label: p.label ? `${p.label} (${p.display_phone_number})` : p.display_phone_number }));
}
