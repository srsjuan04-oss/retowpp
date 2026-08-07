import type { SupabaseClient } from "@supabase/supabase-js";
import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import {
  AI_AGENT_REPLY_QUEUE,
  buildMessageStatusDedupeKey,
  isForwardStatusTransition,
  WEBHOOK_PROCESSING_QUEUE,
  type MessageStatus,
  type WhatsAppWebhookPayload,
} from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";
import { createWorkerSupabaseClient } from "../supabase";
import { findOrCreateConversation } from "../lib/conversations";

type Client = SupabaseClient<Database>;

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

async function findOrCreateContact(supabase: Client, waId: string, profileName: string | undefined) {
  const { data: existing } = await supabase.from("contacts").select("id").eq("wa_id", waId).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({ wa_id: waId, display_name: profileName ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function findPhoneNumberRowId(supabase: Client, metaPhoneNumberId: string) {
  const { data } = await supabase
    .from("phone_numbers")
    .select("id")
    .eq("phone_number_id", metaPhoneNumberId)
    .maybeSingle();
  if (!data) {
    throw new Error(
      `phone_number_id ${metaPhoneNumberId} no está configurado en phone_numbers; revisa el módulo de conexión WABA.`,
    );
  }
  return data.id;
}

async function processInboundMessages(
  supabase: Client,
  value: NonNullable<WhatsAppWebhookPayload["entry"][number]["changes"][number]["value"]>,
  aiAgentReplyQueue: Queue,
) {
  const metaPhoneNumberId = value.metadata.phone_number_id;
  const phoneNumberRowId = await findPhoneNumberRowId(supabase, metaPhoneNumberId);
  const profileByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

  for (const raw of value.messages ?? []) {
    const contactId = await findOrCreateContact(supabase, raw.from, profileByWaId.get(raw.from));
    const conversationId = await findOrCreateConversation(supabase, contactId, phoneNumberRowId);

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

    // Solo se dispara el agente de IA ante un inbound nuevo de verdad (no en un
    // reintento del mismo webhook, que con ignoreDuplicates no inserta nada).
    if (insertedMessage && insertedMessage.length > 0 && messageType === "text") {
      await aiAgentReplyQueue.add(
        "reply",
        { conversationId },
        { jobId: `ai-agent-reply|${raw.id}`, attempts: 2, backoff: { type: "exponential", delay: 5000 } },
      );
    }

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

export async function processWebhookEvent(supabase: Client, webhookEventId: string, aiAgentReplyQueue: Queue): Promise<void> {
  const { data: event, error } = await supabase
    .from("webhook_events")
    .select("id, payload, processed_at, retry_count")
    .eq("id", webhookEventId)
    .single();
  if (error) throw error;
  if (event.processed_at) return; // Ya procesado (sweeper + job normal corriendo dos veces, por ejemplo).

  try {
    const payload = event.payload as unknown as WhatsAppWebhookPayload;
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        await processInboundMessages(supabase, change.value, aiAgentReplyQueue);
        await processStatusEvents(supabase, change.value);
      }
    }
    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: null })
      .eq("id", webhookEventId);
  } catch (processingError) {
    const message = processingError instanceof Error ? processingError.message : String(processingError);
    await supabase
      .from("webhook_events")
      .update({ processing_error: message, retry_count: event.retry_count + 1 })
      .eq("id", webhookEventId);
    throw processingError; // BullMQ reintenta según la configuración del job.
  }
}

export function createWebhookProcessingWorker(connection: ConnectionOptions): { worker: Worker; aiAgentReplyQueue: Queue } {
  const supabase = createWorkerSupabaseClient();
  const aiAgentReplyQueue = new Queue(AI_AGENT_REPLY_QUEUE, { connection });

  const worker = new Worker(
    WEBHOOK_PROCESSING_QUEUE,
    async (job: Job<{ webhookEventId: string }>) => {
      await processWebhookEvent(supabase, job.data.webhookEventId, aiAgentReplyQueue);
    },
    { connection },
  );

  return { worker, aiAgentReplyQueue };
}
