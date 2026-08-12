import type { SupabaseClient } from "@supabase/supabase-js";
import { Worker, type Job, type ConnectionOptions } from "bullmq";
import { FLOW_ENGINE_QUEUE, assertCanContact } from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";
import { createWorkerSupabaseClient } from "../supabase";
import { getWhatsAppClientForPhoneNumber } from "../lib/whatsapp-client";

type Client = SupabaseClient<Database>;

interface FlowStepRow {
  id: string;
  content_type: "text" | "image" | "audio";
  text_body: string | null;
  media_path: string | null;
  media_mime_type: string | null;
}

/** Envía un paso del flujo (texto o media por link firmado) y registra el mensaje saliente. */
async function sendStep(
  supabase: Client,
  step: FlowStepRow,
  waId: string,
  conversationId: string,
  phoneNumberRowId: string,
): Promise<void> {
  const client = await getWhatsAppClientForPhoneNumber(supabase, phoneNumberRowId);

  let wamid: string | null = null;
  if (step.content_type === "text" && step.text_body) {
    const response = await client.sendTextMessage({ to: waId, body: step.text_body });
    wamid = response.messages[0]?.id ?? null;
  } else if ((step.content_type === "image" || step.content_type === "audio") && step.media_path) {
    const { data: signed } = await supabase.storage.from("flow-media").createSignedUrl(step.media_path, 3600);
    if (!signed?.signedUrl) throw new Error(`No se pudo firmar la URL del media del paso ${step.id}.`);
    const response = await client.sendMediaMessage({ to: waId, type: step.content_type, link: signed.signedUrl });
    wamid = response.messages[0]?.id ?? null;
  } else {
    throw new Error(`Paso ${step.id} sin contenido enviable (content_type=${step.content_type}).`);
  }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    wamid,
    direction: "outbound",
    sender_type: "system",
    message_type: step.content_type,
    content: step.content_type === "text" ? { body: step.text_body } : { mediaPath: step.media_path },
    status: "sent",
  });
  await supabase.from("conversations").update({ last_outbound_at: new Date().toISOString() }).eq("id", conversationId);
}

function matchesBranch(matchType: string, matchValue: string | null, replyBody: string): boolean {
  if (matchType === "any") return true;
  if (!matchValue) return false;
  const reply = replyBody.trim().toLowerCase();
  const value = matchValue.trim().toLowerCase();
  if (matchType === "equals") return reply === value;
  if (matchType === "contains") return reply.includes(value);
  return false;
}

async function completeRun(supabase: Client, runId: string): Promise<void> {
  await supabase.from("flow_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", runId);
}

/**
 * Avanza una `flow_run` activa: evalúa las ramas del paso actual contra el texto
 * de la respuesta y manda el siguiente paso, o cierra el run si ninguna rama
 * aplica o la rama que aplicó no tiene siguiente paso (fin explícito del flujo).
 */
async function advanceRun(
  supabase: Client,
  run: { id: string; current_step_id: string | null },
  replyBody: string,
  waId: string,
  conversationId: string,
  phoneNumberRowId: string,
): Promise<void> {
  if (!run.current_step_id) {
    await completeRun(supabase, run.id);
    return;
  }

  const { data: branches, error } = await supabase
    .from("flow_branches")
    .select("match_type, match_value, to_step_id")
    .eq("from_step_id", run.current_step_id)
    .order("priority", { ascending: true });
  if (error) throw error;

  const matched = (branches ?? []).find((b) => matchesBranch(b.match_type, b.match_value, replyBody));
  if (!matched || !matched.to_step_id) {
    await completeRun(supabase, run.id);
    return;
  }

  const { data: nextStep, error: stepError } = await supabase
    .from("flow_steps")
    .select("id, content_type, text_body, media_path, media_mime_type")
    .eq("id", matched.to_step_id)
    .single();
  if (stepError) throw stepError;

  await sendStep(supabase, nextStep, waId, conversationId, phoneNumberRowId);
  await supabase.from("flow_runs").update({ current_step_id: nextStep.id }).eq("id", run.id);

  const { count } = await supabase
    .from("flow_branches")
    .select("id", { count: "exact", head: true })
    .eq("from_step_id", nextStep.id);
  if (!count || count === 0) await completeRun(supabase, run.id);
}

/**
 * Intenta arrancar un flujo cuando la respuesta llega justo después de una
 * plantilla que dispara un flujo activo. No arranca dos veces para el mismo
 * mensaje entrante (idempotencia por trigger_wamid).
 */
async function maybeStartRun(
  supabase: Client,
  conversationId: string,
  contactId: string,
  phoneNumberRowId: string,
  inboundCreatedAt: string,
  inboundWamid: string | null,
  waId: string,
): Promise<void> {
  const { data: lastOutboundTemplate } = await supabase
    .from("messages")
    .select("content")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .eq("message_type", "template")
    .lt("created_at", inboundCreatedAt)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastOutboundTemplate) return;

  const templateName = (lastOutboundTemplate.content as { templateName?: string } | null)?.templateName;
  if (!templateName) return;

  // Coincide por nombre solamente (no por waba_account_id de nuestra tabla): el
  // envío real de plantillas tampoco filtra por eso, Meta resuelve el nombre
  // dentro del número que envía. Si el mismo nombre existe en más de una WABA
  // conectada, toma cualquiera — mismo criterio "opaco" que ya usa el envío.
  const { data: template } = await supabase.from("templates").select("id").eq("name", templateName).limit(1).maybeSingle();
  if (!template) return;

  const { data: flow } = await supabase
    .from("flows")
    .select("id")
    .eq("template_id", template.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!flow) return;

  if (inboundWamid) {
    const { data: existingRun } = await supabase
      .from("flow_runs")
      .select("id")
      .eq("trigger_wamid", inboundWamid)
      .maybeSingle();
    if (existingRun) return; // reintento del mismo webhook: ya se arrancó este run.
  }

  const { data: firstStep, error: stepError } = await supabase
    .from("flow_steps")
    .select("id, content_type, text_body, media_path, media_mime_type")
    .eq("flow_id", flow.id)
    .eq("step_order", 1)
    .maybeSingle();
  if (stepError) throw stepError;
  if (!firstStep) return; // flujo activo sin pasos: no debería pasar (la UI exige al menos 1 para activar).

  const { data: run, error: runError } = await supabase
    .from("flow_runs")
    .insert({
      flow_id: flow.id,
      contact_id: contactId,
      conversation_id: conversationId,
      current_step_id: firstStep.id,
      trigger_wamid: inboundWamid ?? crypto.randomUUID(),
      status: "active",
    })
    .select("id")
    .single();
  if (runError) throw runError;

  await sendStep(supabase, firstStep, waId, conversationId, phoneNumberRowId);

  const { count } = await supabase
    .from("flow_branches")
    .select("id", { count: "exact", head: true })
    .eq("from_step_id", firstStep.id);
  if (!count || count === 0) await completeRun(supabase, run.id);
}

export async function processFlowEngine(supabase: Client, conversationId: string): Promise<void> {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("contact_id, phone_number_id")
    .eq("id", conversationId)
    .single();
  if (conversationError) throw conversationError;

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("wa_id, consent_status")
    .eq("id", conversation.contact_id)
    .single();
  if (contactError) throw contactError;
  if (!assertCanContact(contact.consent_status).allowed) return;

  const { data: lastInbound } = await supabase
    .from("messages")
    .select("wamid, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .eq("message_type", "text")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastInbound) return;
  const replyBody = (lastInbound.content as { body?: string } | null)?.body ?? "";

  const { data: activeRun } = await supabase
    .from("flow_runs")
    .select("id, current_step_id")
    .eq("conversation_id", conversationId)
    .eq("status", "active")
    .maybeSingle();

  if (activeRun) {
    await advanceRun(supabase, activeRun, replyBody, contact.wa_id, conversationId, conversation.phone_number_id);
    return;
  }

  await maybeStartRun(
    supabase,
    conversationId,
    conversation.contact_id,
    conversation.phone_number_id,
    lastInbound.created_at,
    lastInbound.wamid,
    contact.wa_id,
  );
}

export function createFlowEngineWorker(connection: ConnectionOptions): Worker {
  const supabase = createWorkerSupabaseClient();
  return new Worker(
    FLOW_ENGINE_QUEUE,
    async (job: Job<{ conversationId: string }>) => {
      await processFlowEngine(supabase, job.data.conversationId);
    },
    { connection },
  );
}
