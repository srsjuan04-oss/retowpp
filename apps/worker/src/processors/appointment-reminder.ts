import type { SupabaseClient } from "@supabase/supabase-js";
import { Worker, type Job, type ConnectionOptions } from "bullmq";
import {
  APPOINTMENT_REMINDER_QUEUE,
  WhatsAppApiError,
  normalizeWaId,
  renderTemplateComponents,
  resolveAppointmentReminderVariables,
  type AppointmentReminderPayload,
  type StoredTemplateComponent,
} from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";
import { createWorkerSupabaseClient } from "../supabase";
import { getWhatsAppClientForPhoneNumber } from "../lib/whatsapp-client";
import { findOrCreateConversation } from "../lib/conversations";

type Client = SupabaseClient<Database>;

async function findOrCreateContact(supabase: Client, waId: string, companyId: string, displayName: string | null) {
  const { data: existing } = await supabase
    .from("contacts")
    .select("id")
    .eq("wa_id", waId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({ wa_id: waId, display_name: displayName, company_id: companyId })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function markEvent(supabase: Client, eventId: string, patch: { processing_error?: string | null; message_id?: string }) {
  await supabase
    .from("appointment_reminder_events")
    .update({ processed_at: new Date().toISOString(), ...patch })
    .eq("id", eventId);
}

export async function processAppointmentReminderEvent(supabase: Client, eventId: string): Promise<void> {
  const { data: event, error } = await supabase
    .from("appointment_reminder_events")
    .select("id, payload, processed_at, appointment_reminder_webhook_id")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  if (event.processed_at) return; // ya procesado (reintento/reentrega duplicada)

  const { data: config, error: configError } = await supabase
    .from("appointment_reminder_webhooks")
    .select("template_id, phone_number_id, variable_mapping, is_active, company_id")
    .eq("id", event.appointment_reminder_webhook_id)
    .single();
  if (configError) throw configError;
  if (!config.is_active) {
    await markEvent(supabase, eventId, { processing_error: "El recordatorio estaba inactivo al procesarse." });
    return;
  }
  if (!config.template_id) {
    await markEvent(supabase, eventId, { processing_error: "No hay plantilla configurada todavía para este recordatorio." });
    return;
  }

  const payload = event.payload as unknown as AppointmentReminderPayload;
  const waId = payload.phone ? normalizeWaId(payload.phone) : null;
  if (!waId) {
    await markEvent(supabase, eventId, { processing_error: "El payload no trae un teléfono válido." });
    return;
  }

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("name, language, components")
    .eq("id", config.template_id)
    .single();
  if (templateError) throw templateError;

  const variables = resolveAppointmentReminderVariables(config.variable_mapping as Record<string, string>, payload);
  const { components, missingVariables } = renderTemplateComponents(
    template.components as unknown as StoredTemplateComponent[],
    variables,
  );
  if (missingVariables.length > 0) {
    await markEvent(supabase, eventId, { processing_error: `Variables faltantes: ${missingVariables.join(", ")}` });
    return;
  }

  const contactId = await findOrCreateContact(supabase, waId, config.company_id, payload.customerName);
  const conversationId = await findOrCreateConversation(supabase, contactId, config.phone_number_id, config.company_id);

  try {
    const client = await getWhatsAppClientForPhoneNumber(supabase, config.phone_number_id);
    const response = await client.sendTemplateMessage({
      to: waId,
      templateName: template.name,
      languageCode: template.language,
      components,
    });
    const wamid = response.messages[0]?.id ?? null;

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        wamid,
        direction: "outbound",
        sender_type: "system",
        message_type: "template",
        content: { templateName: template.name, variables },
        status: "sent",
      })
      .select("id")
      .single();
    if (messageError) throw messageError;

    await supabase.from("conversations").update({ last_outbound_at: new Date().toISOString() }).eq("id", conversationId);
    await markEvent(supabase, eventId, { message_id: message.id, processing_error: null });
  } catch (sendError) {
    if (sendError instanceof WhatsAppApiError && sendError.isRateLimited) {
      // Límite de tasa temporal de Meta: se deja sin marcar procesado para que
      // BullMQ reintente con backoff, igual que en hotmart-webhook.ts.
      throw sendError;
    }
    const message = sendError instanceof Error ? sendError.message : "Error enviando el recordatorio de cita.";
    await markEvent(supabase, eventId, { processing_error: message });
  }
}

export function createAppointmentReminderWorker(connection: ConnectionOptions): Worker {
  const supabase = createWorkerSupabaseClient();

  return new Worker(
    APPOINTMENT_REMINDER_QUEUE,
    async (job: Job<{ eventId: string }>) => {
      await processAppointmentReminderEvent(supabase, job.data.eventId);
    },
    { connection },
  );
}
