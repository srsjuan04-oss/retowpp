import "server-only";
import type { ConsentStatus, ConversationStatus, MessageStatus } from "@reto-whatsapp/db";
import { createClient } from "@/lib/supabase/server";

async function countWhere(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "messages" | "conversations" | "contacts",
  column: string,
  value: string,
): Promise<number> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

export interface MessageStats {
  byStatus: Record<MessageStatus, number>;
  inbound: number;
  outbound: number;
}

const MESSAGE_STATUSES: MessageStatus[] = ["queued", "sent", "delivered", "read", "failed"];

export async function getMessageStats(): Promise<MessageStats> {
  const supabase = await createClient();

  const byStatusEntries = await Promise.all(
    MESSAGE_STATUSES.map(async (status) => [status, await countWhere(supabase, "messages", "status", status)] as const),
  );

  const [inbound, outbound] = await Promise.all([
    countWhere(supabase, "messages", "direction", "inbound"),
    countWhere(supabase, "messages", "direction", "outbound"),
  ]);

  return {
    byStatus: Object.fromEntries(byStatusEntries) as Record<MessageStatus, number>,
    inbound,
    outbound,
  };
}

const CONVERSATION_STATUSES: ConversationStatus[] = ["open", "pending", "closed"];

export async function getConversationStats(): Promise<Record<ConversationStatus, number>> {
  const supabase = await createClient();
  const entries = await Promise.all(
    CONVERSATION_STATUSES.map(async (status) => [status, await countWhere(supabase, "conversations", "status", status)] as const),
  );
  return Object.fromEntries(entries) as Record<ConversationStatus, number>;
}

const CONSENT_STATUSES: ConsentStatus[] = ["subscribed", "unsubscribed", "blocked", "pending"];

export async function getContactStats(): Promise<Record<ConsentStatus, number>> {
  const supabase = await createClient();
  const entries = await Promise.all(
    CONSENT_STATUSES.map(async (status) => [status, await countWhere(supabase, "contacts", "consent_status", status)] as const),
  );
  return Object.fromEntries(entries) as Record<ConsentStatus, number>;
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

export async function getRecentCampaignStats(): Promise<RecentCampaignStat[]> {
  const supabase = await createClient();
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  if (!campaigns || campaigns.length === 0) return [];

  const results: RecentCampaignStat[] = [];
  for (const campaign of campaigns) {
    const { data: recipients, error: recipientsError } = await supabase
      .from("campaign_recipients")
      .select("status")
      .eq("campaign_id", campaign.id);
    if (recipientsError) throw recipientsError;

    const counts = { total: recipients?.length ?? 0, sent: 0, delivered: 0, read: 0, failed: 0 };
    for (const r of recipients ?? []) {
      if (r.status === "sent") counts.sent++;
      if (r.status === "delivered") counts.delivered++;
      if (r.status === "read") counts.read++;
      if (r.status === "failed") counts.failed++;
    }
    results.push({ id: campaign.id, name: campaign.name, status: campaign.status, ...counts });
  }
  return results;
}
