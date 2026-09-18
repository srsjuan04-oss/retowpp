import "server-only";
import type { ConsentStatus, ConversationStatus, MessageStatus } from "@reto-whatsapp/db";
import { createClient } from "@/lib/supabase/server";

export interface MessageStats {
  byStatus: Record<MessageStatus, number>;
  inbound: number;
  outbound: number;
}

const MESSAGE_STATUSES: MessageStatus[] = ["queued", "sent", "delivered", "read", "failed"];

/** Antes hacía 5 counts de status + 2 de direction (7 consultas); ahora una sola vista
 * agregada (ver migración 20260918180000) evita agotar el pool de conexiones. */
export async function getMessageStats(): Promise<MessageStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("message_status_counts").select("status, direction, count");
  if (error) throw error;

  const byStatus = Object.fromEntries(MESSAGE_STATUSES.map((s) => [s, 0])) as Record<MessageStatus, number>;
  let inbound = 0;
  let outbound = 0;
  for (const row of data ?? []) {
    if (row.status !== null) byStatus[row.status] = (byStatus[row.status] ?? 0) + row.count;
    if (row.direction === "inbound") inbound += row.count;
    if (row.direction === "outbound") outbound += row.count;
  }
  return { byStatus, inbound, outbound };
}

const CONVERSATION_STATUSES: ConversationStatus[] = ["open", "pending", "closed"];

export async function getConversationStats(): Promise<Record<ConversationStatus, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("conversation_status_counts").select("status, count");
  if (error) throw error;

  const byStatus = Object.fromEntries(CONVERSATION_STATUSES.map((s) => [s, 0])) as Record<ConversationStatus, number>;
  for (const row of data ?? []) if (row.status !== null) byStatus[row.status] = row.count;
  return byStatus;
}

const CONSENT_STATUSES: ConsentStatus[] = ["subscribed", "unsubscribed", "blocked", "pending"];

export async function getContactStats(): Promise<Record<ConsentStatus, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contact_consent_counts").select("consent_status, count");
  if (error) throw error;

  const byStatus = Object.fromEntries(CONSENT_STATUSES.map((s) => [s, 0])) as Record<ConsentStatus, number>;
  for (const row of data ?? []) if (row.consent_status !== null) byStatus[row.consent_status] = row.count;
  return byStatus;
}

export interface RecentCampaignStat {
  id: string;
  name: string;
  status: string;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

/** Antes hacía 1 query de campañas + hasta 10 más (una por campaña) para sus
 * destinatarios. Ahora una sola consulta a la vista agregada, filtrada por los ids ya
 * acotados a 10 — evita el patrón N+1 que agotaba el pool de conexiones en /stats. */
export async function getRecentCampaignStats(): Promise<RecentCampaignStat[]> {
  const supabase = await createClient();
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  if (!campaigns || campaigns.length === 0) return [];

  const campaignIds = campaigns.map((c) => c.id);
  const { data: recipientCounts, error: recipientsError } = await supabase
    .from("campaign_recipient_counts")
    .select("campaign_id, status, count")
    .in("campaign_id", campaignIds);
  if (recipientsError) throw recipientsError;

  const countsByCampaign = new Map<string, { total: number; sent: number; delivered: number; read: number; failed: number }>();
  for (const row of recipientCounts ?? []) {
    if (row.campaign_id === null) continue;
    const counts = countsByCampaign.get(row.campaign_id) ?? { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
    counts.total += row.count;
    if (row.status === "sent") counts.sent += row.count;
    if (row.status === "delivered") counts.delivered += row.count;
    if (row.status === "read") counts.read += row.count;
    if (row.status === "failed") counts.failed += row.count;
    countsByCampaign.set(row.campaign_id, counts);
  }

  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    ...(countsByCampaign.get(campaign.id) ?? { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 }),
  }));
}
