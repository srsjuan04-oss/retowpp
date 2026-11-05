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
  isUnread: boolean;
  /** Solo se llena en `listConversations`; el hilo de detalle ya muestra todos los mensajes, no la necesita. */
  lastMessagePreview?: string | null;
  contact: { id: string; displayName: string | null; waId: string };
  /** Solo se llena en `listConversations`, para filtrar la bandeja por número. */
  phoneNumber?: { id: string; label: string };
}

/** Sin lectura por-agente: un solo `last_read_at` por conversación alcanza para el caso de uso actual. */
function computeIsUnread(lastInboundAt: string | null, lastReadAt: string | null): boolean {
  if (!lastInboundAt) return false;
  if (!lastReadAt) return true;
  return new Date(lastInboundAt).getTime() > new Date(lastReadAt).getTime();
}

const PREVIEW_MAX_LENGTH = 60;

function derivePreview(messageType: string, content: Record<string, unknown> | null): string {
  if (typeof content?.body === "string" && content.body.trim()) {
    const body = content.body.trim();
    return body.length > PREVIEW_MAX_LENGTH ? `${body.slice(0, PREVIEW_MAX_LENGTH)}…` : body;
  }
  if (messageType === "template") return "Plantilla enviada";
  if (messageType === "unknown") return "Mensaje no compatible";
  return `[${messageType}]`;
}

/**
 * Dos consultas simples en vez de un `select` con embedding de recursos
 * (`*, contacts(*)`), porque los tipos de packages/db no modelan las
 * relaciones FK (Relationships) que ese estilo de query necesita.
 */
/** PostgREST corta cada respuesta en 1000 filas (max_rows); se pide por páginas. */
const PAGE_SIZE = 1000;
/** UUIDs por `.in(...)`: ~37 caracteres cada uno, 150 dejan la URL en ~6 KB. Con listas de
 * miles PostgREST respondía "400 Bad Request" (nos pasó con 691 contactos / 1097 conversaciones). */
const IN_CHUNK_SIZE = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function listConversations(): Promise<ConversationListItem[]> {
  const supabase = await createClient();

  const conversations: Array<{
    id: string;
    status: ConversationStatus;
    assigned_to: string | null;
    assigned_team_id: string | null;
    last_inbound_at: string | null;
    last_outbound_at: string | null;
    last_read_at: string | null;
    contact_id: string;
    phone_number_id: string;
  }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from("conversations")
      .select(
        "id, status, assigned_to, assigned_team_id, last_inbound_at, last_outbound_at, last_read_at, contact_id, phone_number_id",
      )
      .order("last_inbound_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    conversations.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }
  if (conversations.length === 0) return [];

  // Antes se traían TODOS los contactos de la empresa sin filtro, pero PostgREST corta en
  // 1000 filas: con 12 mil contactos, la mayoría de conversaciones salía sin nombre ni
  // número. Ahora solo los contactos de estas conversaciones, en lotes chicos.
  const contactIds = [...new Set(conversations.map((c) => c.contact_id))];
  const contactPages = await Promise.all(
    chunk(contactIds, IN_CHUNK_SIZE).map((ids) => supabase.from("contacts").select("id, display_name, wa_id").in("id", ids)),
  );
  const contactById = new Map<string, { id: string; display_name: string | null; wa_id: string }>();
  for (const { data, error: contactsError } of contactPages) {
    if (contactsError) throw contactsError;
    for (const c of data ?? []) contactById.set(c.id, c);
  }

  const { data: phoneNumbers, error: phoneNumbersError } = await supabase
    .from("phone_numbers")
    .select("id, display_phone_number, label");
  if (phoneNumbersError) throw phoneNumbersError;
  const phoneNumberById = new Map((phoneNumbers ?? []).map((p) => [p.id, p]));

  // Vista `conversation_last_message` (LATERAL ... LIMIT 1 por conversación, migración
  // 20261104230000), filtrada por lotes a las conversaciones listadas: sin filtro también
  // se cortaba en 1000 filas y el resto quedaba sin vista previa.
  const messagePages = await Promise.all(
    chunk(
      conversations.map((c) => c.id),
      IN_CHUNK_SIZE,
    ).map((ids) =>
      supabase.from("conversation_last_message").select("conversation_id, message_type, content").in("conversation_id", ids),
    ),
  );
  const lastMessageByConversation = new Map<string, { message_type: string; content: unknown }>();
  for (const { data, error: messagesError } of messagePages) {
    if (messagesError) throw messagesError;
    for (const m of data ?? []) {
      if (m.conversation_id === null || m.message_type === null) continue;
      lastMessageByConversation.set(m.conversation_id, { message_type: m.message_type, content: m.content });
    }
  }

  // Se ordena acá (no en el query) por el más reciente entre last_inbound_at y
  // last_outbound_at: una conversación cuyo único mensaje es saliente (ej. un eco de la app
  // de WhatsApp Business, una campaña, un recordatorio) tiene last_inbound_at null, y con el
  // order de Postgrest ordenando solo por esa columna se iba al fondo de la lista en vez de
  // aparecer arriba como reciente.
  const toTime = (value: string | null) => (value ? new Date(value).getTime() : 0);

  return conversations
    .map((c) => {
      const lastMessage = lastMessageByConversation.get(c.id);
      const phoneNumber = phoneNumberById.get(c.phone_number_id);
      return {
        id: c.id,
        status: c.status,
        assignedTo: c.assigned_to,
        assignedTeamId: c.assigned_team_id,
        lastInboundAt: c.last_inbound_at,
        lastOutboundAt: c.last_outbound_at,
        isUnread: computeIsUnread(c.last_inbound_at, c.last_read_at),
        lastMessagePreview: lastMessage
          ? derivePreview(lastMessage.message_type, lastMessage.content as Record<string, unknown>)
          : null,
        contact: {
          id: c.contact_id,
          displayName: contactById.get(c.contact_id)?.display_name ?? null,
          waId: contactById.get(c.contact_id)?.wa_id ?? "",
        },
        phoneNumber: {
          id: c.phone_number_id,
          label: phoneNumber ? (phoneNumber.label ?? phoneNumber.display_phone_number) : "",
        },
      };
    })
    .sort((a, b) => Math.max(toTime(b.lastInboundAt), toTime(b.lastOutboundAt)) - Math.max(toTime(a.lastInboundAt), toTime(a.lastOutboundAt)));
}

export interface ConversationDetail extends ConversationListItem {
  phoneNumberRowId: string;
  contactConsentStatus: ConsentStatus;
  /** Agente de IA pausado solo en esta conversación (un humano la tomó). */
  aiAgentPaused: boolean;
}

export async function getConversation(conversationId: string): Promise<ConversationDetail | null> {
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, status, assigned_to, assigned_team_id, last_inbound_at, last_outbound_at, last_read_at, contact_id, phone_number_id, ai_agent_paused",
    )
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
    isUnread: computeIsUnread(conversation.last_inbound_at, conversation.last_read_at),
    phoneNumberRowId: conversation.phone_number_id,
    contactConsentStatus: contact.consent_status,
    aiAgentPaused: conversation.ai_agent_paused,
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

export interface PhoneNumberOption {
  id: string;
  label: string;
}

/** Todos los números conectados de la empresa, para el filtro de la bandeja — a diferencia
 * de derivarlos de `listConversations`, incluye los que todavía no tienen conversaciones. */
export async function listPhoneNumberOptions(): Promise<PhoneNumberOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("phone_numbers")
    .select("id, display_phone_number, label")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, label: p.label ?? p.display_phone_number }));
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
