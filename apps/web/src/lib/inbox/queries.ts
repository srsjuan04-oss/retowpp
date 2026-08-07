import "server-only";
import type {
  ConsentStatus,
  ConversationStatus,
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  MessageType,
} from "@reto-whatsapp/db";
import { createClient } from "@/lib/supabase/server";

export interface ConversationListItem {
  id: string;
  status: ConversationStatus;
  assignedTo: string | null;
  assignedTeamId: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  contact: { id: string; displayName: string | null; waId: string };
}

/**
 * Dos consultas simples en vez de un `select` con embedding de recursos
 * (`*, contacts(*)`), porque los tipos de packages/db no modelan las
 * relaciones FK (Relationships) que ese estilo de query necesita.
 */
export async function listConversations(): Promise<ConversationListItem[]> {
  const supabase = await createClient();

  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, status, assigned_to, assigned_team_id, last_inbound_at, last_outbound_at, contact_id")
    .order("last_inbound_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  if (!conversations || conversations.length === 0) return [];

  const contactIds = [...new Set(conversations.map((c) => c.contact_id))];
  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id, display_name, wa_id")
    .in("id", contactIds);
  if (contactsError) throw contactsError;
  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));

  return conversations.map((c) => ({
    id: c.id,
    status: c.status,
    assignedTo: c.assigned_to,
    assignedTeamId: c.assigned_team_id,
    lastInboundAt: c.last_inbound_at,
    lastOutboundAt: c.last_outbound_at,
    contact: {
      id: c.contact_id,
      displayName: contactById.get(c.contact_id)?.display_name ?? null,
      waId: contactById.get(c.contact_id)?.wa_id ?? "",
    },
  }));
}

export interface ConversationDetail extends ConversationListItem {
  phoneNumberRowId: string;
  contactConsentStatus: ConsentStatus;
}

export async function getConversation(conversationId: string): Promise<ConversationDetail | null> {
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, status, assigned_to, assigned_team_id, last_inbound_at, last_outbound_at, contact_id, phone_number_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return null;

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, display_name, wa_id, consent_status")
    .eq("id", conversation.contact_id)
    .maybeSingle();
  if (!contact) return null;

  return {
    id: conversation.id,
    status: conversation.status,
    assignedTo: conversation.assigned_to,
    assignedTeamId: conversation.assigned_team_id,
    lastInboundAt: conversation.last_inbound_at,
    lastOutboundAt: conversation.last_outbound_at,
    phoneNumberRowId: conversation.phone_number_id,
    contactConsentStatus: contact.consent_status,
    contact: { id: contact.id, displayName: contact.display_name, waId: contact.wa_id },
  };
}

export interface MessageItem {
  id: string;
  direction: MessageDirection;
  senderType: MessageSenderType;
  messageType: MessageType;
  content: Record<string, unknown>;
  status: MessageStatus;
  createdAt: string;
}

export async function listMessages(conversationId: string): Promise<MessageItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, direction, sender_type, message_type, content, status, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((m) => ({
    id: m.id,
    direction: m.direction,
    senderType: m.sender_type,
    messageType: m.message_type,
    content: m.content as unknown as Record<string, unknown>,
    status: m.status,
    createdAt: m.created_at,
  }));
}

export interface AssignableProfile {
  id: string;
  fullName: string | null;
}

export async function listAssignableProfiles(): Promise<AssignableProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name").eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, fullName: p.full_name }));
}
