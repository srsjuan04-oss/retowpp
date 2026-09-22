import type { SupabaseClient } from "@supabase/supabase-js";
import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import {
  AI_AGENT_REPLY_QUEUE,
  FLOW_ENGINE_QUEUE,
  buildMessageStatusDedupeKey,
  isForwardStatusTransition,
  normalizeWaId,
  WEBHOOK_PROCESSING_QUEUE,
  type MessageStatus,
  type WhatsAppWebhookPayload,
} from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";
import { createWorkerSupabaseClient } from "../supabase";
import { findOrCreateConversation } from "../lib/conversations";

type Client = SupabaseClient<Database>;

// Cuánto espera el agente de IA a que el cliente termine de escribir antes de responder.
const AI_REPLY_DEBOUNCE_MS = 3000;
const MEDIA_MESSAGE_TYPES = new Set(["image", "document", "audio", "video", "sticker"]);
const KNOWN_MESSAGE_TYPES = new Set([
  "text",
  "template",
  "image",
  "document",
  "audio",
  "video",
  "sticker",
  "location",
  "interactive",
  "button",
]);

function mapInboundMessageType(rawType: string): Database["public"]["Enums"]["message_type"] {
  return (KNOWN_MESSAGE_TYPES.has(rawType) ? rawType : "unknown") as Database["public"]["Enums"]["message_type"];
}

async function findOrCreateContact(supabase: Client, waId: string, companyId: string, profileName: string | undefined) {
  // wa_id ya no es único a nivel global: el mismo número puede ser contacto
  // de más de una empresa, cada una con sus propios datos.
  const { data: existing } = await supabase
    .from("contacts")
    .select("id")
    .eq("wa_id", waId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({ wa_id: waId, display_name: profileName ?? null, company_id: companyId })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function findPhoneNumberRow(supabase: Client, metaPhoneNumberId: string) {
  const { data } = await supabase
    .from("phone_numbers")
    .select("id, company_id, ai_agent_enabled")
    .eq("phone_number_id", metaPhoneNumberId)
    .maybeSingle();
  if (!data) {
    throw new Error(
      `phone_number_id ${metaPhoneNumberId} no está configurado en phone_numbers; revisa el módulo de conexión WABA.`,
    );
  }
  return data;
}

async function processInboundMessages(
  supabase: Client,
  value: NonNullable<WhatsAppWebhookPayload["entry"][number]["changes"][number]["value"]>,
  aiAgentReplyQueue: Queue,
  flowEngineQueue: Queue,
) {
  const metaPhoneNumberId = value.metadata.phone_number_id;
  const phoneNumberRow = await findPhoneNumberRow(supabase, metaPhoneNumberId);
  const phoneNumberRowId = phoneNumberRow.id;
  const companyId = phoneNumberRow.company_id;
  const profileByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id ?? c.user_id, c.profile?.name]));

  for (const raw of value.messages ?? []) {
    // Contacto que escribió por username sin exponer teléfono: Meta solo manda
    // from_user_id ("CO.<dígitos>"), que se usa igual como identidad (se puede
    // responder a ese mismo valor por `to` en el envío).
    const waId = raw.from ?? raw.from_user_id;
    if (!waId) continue; // Sin ningún identificador no hay forma de crear el contacto ni de responderle.

    const contactId = await findOrCreateContact(supabase, waId, companyId, profileByWaId.get(waId));
    const conversationId = await findOrCreateConversation(supabase, contactId, phoneNumberRowId, companyId);

    const messageType = mapInboundMessageType(raw.type);
    const mediaId = MEDIA_MESSAGE_TYPES.has(raw.type) ? ((raw[raw.type] as { id?: string })?.id ?? null) : null;
    const content = (raw[raw.type] as Record<string, unknown>) ?? {};
    const occurredAt = new Date(Number(raw.timestamp) * 1000).toISOString();

    const { data: insertedMessage, error: messageError } = await supabase
      .from("messages")
      .upsert(
        {
          conversation_id: conversationId,
          wamid: raw.id,
          direction: "inbound",
          sender_type: "contact",
          message_type: messageType,
          content,
          media_id: mediaId,
          status: "delivered",
        },
        { onConflict: "wamid", ignoreDuplicates: true },
      )
      .select("id");
    if (messageError) throw messageError;

    const { data: conversation, error: conversationFetchError } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", conversationId)
      .single();
    if (conversationFetchError) throw conversationFetchError;

    // Un inbound nuevo en una conversación cerrada la reabre; en otro caso no se toca el status.
    const conversationUpdate: Database["public"]["Tables"]["conversations"]["Update"] = {
      last_inbound_at: occurredAt,
    };
    if (conversation.status === "closed") conversationUpdate.status = "open";

    await supabase.from("conversations").update(conversationUpdate).eq("id", conversationId);

    // Se dispara el agente de IA / motor de flujos DESPUÉS de persistir last_inbound_at:
    // si se encolara antes, el worker de ai-agent-reply podía leer la conversación con
    // last_inbound_at todavía en null (conversación nueva) y descartar la respuesta por
    // la regla de ventana de 24h, en una carrera contra este mismo UPDATE.
    // Solo se dispara ante un inbound nuevo de verdad (no en un reintento del mismo
    // webhook, que con ignoreDuplicates no inserta nada).
    if (insertedMessage && insertedMessage.length > 0 && messageType === "text") {
      // ai_agent_enabled es el interruptor por número (además del general de la empresa en
      // ai_agent_settings, que sigue revisando el propio worker de ai-agent-reply): permite
      // pausar el bot en un número puntual sin tocar los demás ni el resto del procesamiento.
      if (phoneNumberRow.ai_agent_enabled) {
        // Espera corta antes de responder: si el cliente manda varios mensajes seguidos
        // ("hola" / "quiero una cita" / "mañana"), solo responde el job del último, con
        // todos en contexto — un solo mensaje enviado y una sola llamada a Claude.
        await aiAgentReplyQueue.add(
          "reply",
          { conversationId, inboundWamid: raw.id },
          {
            jobId: `ai-agent-reply|${raw.id}`,
            delay: AI_REPLY_DEBOUNCE_MS,
            attempts: 2,
            backoff: { type: "exponential", delay: 5000 },
          },
        );
      }
      await flowEngineQueue.add(
        "advance",
        { conversationId },
        { jobId: `flow-engine|${raw.id}`, attempts: 3, backoff: { type: "exponential", delay: 5000 } },
      );
    }
  }
}

async function processStatusEvents(
  supabase: Client,
  value: NonNullable<WhatsAppWebhookPayload["entry"][number]["changes"][number]["value"]>,
) {
  for (const status of value.statuses ?? []) {
    const dedupeKey = buildMessageStatusDedupeKey(status.id, status.status, status.timestamp);
    const occurredAt = new Date(Number(status.timestamp) * 1000).toISOString();

    const { data: message } = await supabase.from("messages").select("id, status").eq("wamid", status.id).maybeSingle();
    if (!message) continue; // Estado de un mensaje que no reconocemos (aún) o de otra cuenta; se ignora.

    const { data: insertedEvent, error: insertError } = await supabase
      .from("message_status_events")
      .upsert(
        {
          message_id: message.id,
          status: status.status,
          raw_payload: status as unknown as Record<string, unknown>,
          occurred_at: occurredAt,
          dedupe_key: dedupeKey,
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (insertError) throw insertError;
    if (!insertedEvent) continue; // Reentrega exacta del mismo evento: ya procesado.

    if (isForwardStatusTransition(message.status as MessageStatus, status.status as MessageStatus)) {
      const errorPayload = status.errors ? { errors: status.errors } : null;
      await supabase
        .from("messages")
        .update({ status: status.status, error: errorPayload })
        .eq("id", message.id);
    }
  }
}

/** Payload de onboarding de usuarios de la app de WhatsApp Business (migración): ver
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users */
interface HistoryChangeValue {
  metadata?: { display_phone_number: string; phone_number_id: string };
  history?: Array<{
    threads?: Array<{
      id: string;
      messages?: Array<{
        from: string;
        to: string;
        id: string;
        timestamp: string;
        type: string;
        history_context?: { status?: string };
        [key: string]: unknown;
      }>;
    }>;
  }>;
}

interface SmbAppStateSyncChangeValue {
  metadata?: { phone_number_id: string };
  state_sync?: Array<{
    type: string;
    action: "add" | "remove";
    contact?: { full_name?: string; first_name?: string; phone_number?: string };
  }>;
}

interface MessageEchoesChangeValue {
  metadata?: { phone_number_id: string };
  message_echoes?: Array<{
    from: string;
    to: string;
    id: string;
    timestamp: string;
    type: string;
    [key: string]: unknown;
  }>;
}

const HISTORY_STATUS_MAP: Record<string, Database["public"]["Enums"]["message_status"]> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

/** Trae el historial (hasta 180 días, en chunks) que Meta reenvía tras habilitar la migración
 * de la app de WhatsApp Business. No dispara IA/flujos: son mensajes viejos, no un inbound nuevo. */
async function processHistorySync(supabase: Client, value: HistoryChangeValue) {
  const metaPhoneNumberId = value.metadata?.phone_number_id;
  if (!metaPhoneNumberId) return; // Payload de "history declined" (sync desactivado desde la app): no hay nada que traer.
  const phoneNumberRow = await findPhoneNumberRow(supabase, metaPhoneNumberId);
  const businessWaId = normalizeWaId(value.metadata?.display_phone_number ?? "");

  for (const chunk of value.history ?? []) {
    for (const thread of chunk.threads ?? []) {
      const customerWaId = normalizeWaId(thread.id);
      if (!customerWaId) continue;
      const contactId = await findOrCreateContact(supabase, customerWaId, phoneNumberRow.company_id, undefined);
      const conversationId = await findOrCreateConversation(supabase, contactId, phoneNumberRow.id, phoneNumberRow.company_id);

      for (const raw of thread.messages ?? []) {
        const direction: Database["public"]["Enums"]["message_direction"] =
          normalizeWaId(raw.from) === businessWaId ? "outbound" : "inbound";
        const messageType = mapInboundMessageType(raw.type);
        const mediaId = MEDIA_MESSAGE_TYPES.has(raw.type) ? ((raw[raw.type] as { id?: string })?.id ?? null) : null;
        const content = (raw[raw.type] as Record<string, unknown>) ?? {};
        const occurredAt = new Date(Number(raw.timestamp) * 1000).toISOString();
        const status =
          HISTORY_STATUS_MAP[raw.history_context?.status ?? ""] ?? (direction === "outbound" ? "sent" : "delivered");

        const { error } = await supabase.from("messages").upsert(
          {
            conversation_id: conversationId,
            wamid: raw.id,
            direction,
            sender_type: direction === "outbound" ? "agent" : "contact",
            message_type: messageType,
            content,
            media_id: mediaId,
            status,
            created_at: occurredAt,
          },
          { onConflict: "wamid", ignoreDuplicates: true },
        );
        if (error) throw error;
      }
    }
  }
}

/** Sincroniza los contactos que Yulieth (el negocio) ya tenía guardados en la app de WhatsApp
 * Business. "remove" se ignora a propósito: una acción hecha en el celular no debe borrar
 * datos del CRM (historial, tags, custom_fields) que dependan de ese contacto. */
async function processSmbAppStateSync(supabase: Client, value: SmbAppStateSyncChangeValue) {
  const metaPhoneNumberId = value.metadata?.phone_number_id;
  if (!metaPhoneNumberId) return;
  const phoneNumberRow = await findPhoneNumberRow(supabase, metaPhoneNumberId);

  for (const entry of value.state_sync ?? []) {
    if (entry.type !== "contact" || entry.action !== "add" || !entry.contact?.phone_number) continue;
    const waId = normalizeWaId(entry.contact.phone_number);
    if (!waId) continue;
    const displayName = entry.contact.full_name ?? entry.contact.first_name ?? null;

    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("wa_id", waId)
      .eq("company_id", phoneNumberRow.company_id)
      .maybeSingle();

    if (existing) {
      if (displayName) await supabase.from("contacts").update({ display_name: displayName }).eq("id", existing.id);
    } else {
      const { error } = await supabase
        .from("contacts")
        .insert({ wa_id: waId, display_name: displayName, company_id: phoneNumberRow.company_id });
      if (error) throw error;
    }
  }
}

/** Refleja en el hilo del CRM los mensajes que el negocio mandó directo desde la app de
 * WhatsApp Business (no desde este CRM), para que un agente viendo la conversación no se
 * pierda lo que ya se respondió por fuera. */
async function processMessageEchoes(supabase: Client, value: MessageEchoesChangeValue) {
  const metaPhoneNumberId = value.metadata?.phone_number_id;
  if (!metaPhoneNumberId) return;
  const phoneNumberRow = await findPhoneNumberRow(supabase, metaPhoneNumberId);

  for (const raw of value.message_echoes ?? []) {
    const customerWaId = normalizeWaId(raw.to);
    if (!customerWaId) continue;
    const contactId = await findOrCreateContact(supabase, customerWaId, phoneNumberRow.company_id, undefined);
    const conversationId = await findOrCreateConversation(supabase, contactId, phoneNumberRow.id, phoneNumberRow.company_id);

    const messageType = mapInboundMessageType(raw.type);
    const mediaId = MEDIA_MESSAGE_TYPES.has(raw.type) ? ((raw[raw.type] as { id?: string })?.id ?? null) : null;
    const content = (raw[raw.type] as Record<string, unknown>) ?? {};
    const occurredAt = new Date(Number(raw.timestamp) * 1000).toISOString();

    const { error: messageError } = await supabase.from("messages").upsert(
      {
        conversation_id: conversationId,
        wamid: raw.id,
        direction: "outbound",
        sender_type: "agent",
        message_type: messageType,
        content,
        media_id: mediaId,
        status: "sent",
        created_at: occurredAt,
      },
      { onConflict: "wamid", ignoreDuplicates: true },
    );
    if (messageError) throw messageError;

    await supabase.from("conversations").update({ last_outbound_at: occurredAt }).eq("id", conversationId);
  }
}

export async function processWebhookEvent(
  supabase: Client,
  webhookEventId: string,
  aiAgentReplyQueue: Queue,
  flowEngineQueue: Queue,
): Promise<void> {
  const { data: event, error } = await supabase
    .from("webhook_events")
    .select("id, payload, processed_at, retry_count")
    .eq("id", webhookEventId)
    .single();
  if (error) throw error;
  if (event.processed_at) return; // Ya procesado (sweeper + job normal corriendo dos veces, por ejemplo).

  try {
    const payload = event.payload as unknown as { entry?: Array<{ changes?: Array<{ field: string; value: unknown }> }> };
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        // Cada field trae una forma de `value` distinta; solo se procesan los que se conocen.
        // Otros (account_update, etc.) se ignoran a propósito para no reintentar infinito por
        // errores de forma (ej. metadata.phone_number_id inexistente en un value ajeno).
        switch (change.field) {
          case "messages": {
            const value = change.value as WhatsAppWebhookPayload["entry"][number]["changes"][number]["value"];
            await processInboundMessages(supabase, value, aiAgentReplyQueue, flowEngineQueue);
            await processStatusEvents(supabase, value);
            break;
          }
          case "history":
            await processHistorySync(supabase, change.value as HistoryChangeValue);
            break;
          case "smb_app_state_sync":
            await processSmbAppStateSync(supabase, change.value as SmbAppStateSyncChangeValue);
            break;
          case "smb_message_echoes":
            await processMessageEchoes(supabase, change.value as MessageEchoesChangeValue);
            break;
          default:
            break;
        }
      }
    }
    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: null })
      .eq("id", webhookEventId);
  } catch (processingError) {
    // Los errores de Postgrest (ej. violación de not-null) no son `instanceof Error`:
    // son objetos planos con `.message`. Sin este chequeo, String(objeto) guarda
    // literalmente "[object Object]" y se pierde la causa real del fallo.
    const message =
      processingError instanceof Error
        ? processingError.message
        : processingError && typeof processingError === "object" && "message" in processingError
          ? String((processingError as { message: unknown }).message)
          : JSON.stringify(processingError);
    await supabase
      .from("webhook_events")
      .update({ processing_error: message, retry_count: event.retry_count + 1 })
      .eq("id", webhookEventId);
    throw processingError; // BullMQ reintenta según la configuración del job.
  }
}

export function createWebhookProcessingWorker(
  connection: ConnectionOptions,
): { worker: Worker; aiAgentReplyQueue: Queue; flowEngineQueue: Queue } {
  const supabase = createWorkerSupabaseClient();
  const aiAgentReplyQueue = new Queue(AI_AGENT_REPLY_QUEUE, { connection });
  const flowEngineQueue = new Queue(FLOW_ENGINE_QUEUE, { connection });

  const worker = new Worker(
    WEBHOOK_PROCESSING_QUEUE,
    async (job: Job<{ webhookEventId: string }>) => {
      await processWebhookEvent(supabase, job.data.webhookEventId, aiAgentReplyQueue, flowEngineQueue);
    },
    { connection },
  );

  return { worker, aiAgentReplyQueue, flowEngineQueue };
}
