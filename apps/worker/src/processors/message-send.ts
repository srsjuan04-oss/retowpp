import type { SupabaseClient } from "@supabase/supabase-js";
import { Worker, type Job, type ConnectionOptions } from "bullmq";
import {
  MESSAGE_SEND_QUEUE,
  WhatsAppApiError,
  assertCanContact,
  renderTemplateComponents,
  type StoredTemplateComponent,
} from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";
import { createWorkerSupabaseClient } from "../supabase";
import { getWhatsAppClientForPhoneNumber } from "../lib/whatsapp-client";
import { findOrCreateConversation } from "../lib/conversations";

type Client = SupabaseClient<Database>;

async function markRecipient(
  supabase: Client,
  recipientId: string,
  status: "skipped" | "failed",
  reason: string | null,
): Promise<void> {
  await supabase.from("campaign_recipients").update({ status, skip_reason: reason }).eq("id", recipientId);
}

/** Si ya no quedan destinatarios pendientes/encolados, la campaña se marca completa. */
async function maybeCompleteCampaign(supabase: Client, campaignId: string): Promise<void> {
  const { count, error } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "queued"]);
  if (error) throw error;

  if (count === 0) {
    await supabase
      .from("campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", campaignId);
  }
}

/**
 * Envío individual de un mensaje de campaña. Vuelve a comprobar consentimiento
 * en el momento (pudo cambiar entre el "lock" y el envío real) y valida las
 * variables antes de llamar al Graph API. Nunca se envía dos veces al mismo
 * destinatario: el jobId determinístico + el unique (campaign_id, contact_id)
 * de campaign_recipients son la doble capa de idempotencia.
 */
export async function processMessageSend(supabase: Client, campaignId: string, contactId: string): Promise<void> {
  const { data: recipient, error } = await supabase
    .from("campaign_recipients")
    .select("id, status, variables")
    .eq("campaign_id", campaignId)
    .eq("contact_id", contactId)
    .single();
  if (error) throw error;
  if (recipient.status !== "queued" && recipient.status !== "pending") return; // ya procesado

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("template_id, phone_number_id, company_id")
    .eq("id", campaignId)
    .single();
  if (campaignError) throw campaignError;

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("wa_id, consent_status")
    .eq("id", contactId)
    .single();
  if (contactError) throw contactError;

  const consentCheck = assertCanContact(contact.consent_status);
  if (!consentCheck.allowed) {
    await markRecipient(supabase, recipient.id, "skipped", consentCheck.reason ?? "Sin consentimiento vigente.");
    await maybeCompleteCampaign(supabase, campaignId);
    return;
  }

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("name, language, components")
    .eq("id", campaign.template_id)
    .single();
  if (templateError) throw templateError;

  const { components, missingVariables } = renderTemplateComponents(
    template.components as unknown as StoredTemplateComponent[],
    recipient.variables,
  );
  if (missingVariables.length > 0) {
    await markRecipient(supabase, recipient.id, "failed", `Variables faltantes: ${missingVariables.join(", ")}`);
    await maybeCompleteCampaign(supabase, campaignId);
    return;
  }

  try {
    const client = await getWhatsAppClientForPhoneNumber(supabase, campaign.phone_number_id);
    const response = await client.sendTemplateMessage({
      to: contact.wa_id,
      templateName: template.name,
      languageCode: template.language,
      components,
    });
    const wamid = response.messages[0]?.id ?? null;

    const conversationId = await findOrCreateConversation(supabase, contactId, campaign.phone_number_id, campaign.company_id);
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        wamid,
        direction: "outbound",
        sender_type: "campaign",
        message_type: "template",
        content: { templateName: template.name, variables: recipient.variables },
        status: "sent",
      })
      .select("id")
      .single();
    if (messageError) throw messageError;

    await supabase.from("campaign_recipients").update({ status: "sent", message_id: message.id }).eq("id", recipient.id);
    await supabase
      .from("conversations")
      .update({ last_outbound_at: new Date().toISOString() })
      .eq("id", conversationId);
  } catch (sendError) {
    if (sendError instanceof WhatsAppApiError && sendError.isRateLimited) {
      // Límite de tasa temporal de Meta: se deja 'queued' y se relanza para
      // que BullMQ reintente con backoff, en vez de marcarlo como fallo permanente.
      throw sendError;
    }
    const message = sendError instanceof Error ? sendError.message : "Error enviando mensaje de campaña.";
    await markRecipient(supabase, recipient.id, "failed", message);
    await maybeCompleteCampaign(supabase, campaignId);
    return;
  }

  await maybeCompleteCampaign(supabase, campaignId);
}

export function createMessageSendWorker(connection: ConnectionOptions): Worker {
  const supabase = createWorkerSupabaseClient();

  const worker = new Worker(
    MESSAGE_SEND_QUEUE,
    async (job: Job<{ campaignId: string; contactId: string }>) => {
      await processMessageSend(supabase, job.data.campaignId, job.data.contactId);
    },
    // Límite conservador por defecto para no exceder el throughput de Meta;
    // ajustable según el messaging tier real de cada número.
    { connection, limiter: { max: 8, duration: 1000 } },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;
    if (attemptsMade < maxAttempts) return; // todavía le quedan reintentos

    // Se agotaron los reintentos (p. ej. rate limit persistente): no dejar la
    // campaña colgada esperando un destinatario que nunca se resolverá.
    const { campaignId, contactId } = job.data as { campaignId: string; contactId: string };
    await supabase
      .from("campaign_recipients")
      .update({ status: "failed", skip_reason: err.message })
      .eq("campaign_id", campaignId)
      .eq("contact_id", contactId);
    await maybeCompleteCampaign(supabase, campaignId);
  });

  return worker;
}
