"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { assertCanContact, assertCanSendOutbound, renderTemplateComponents, type StoredTemplateComponent } from "@reto-whatsapp/core";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getWhatsAppClientForPhoneNumber } from "@/lib/whatsapp/get-client-for-phone-number";

const SendMessageSchema = z.object({
  conversationId: z.uuid(),
  body: z.string().min(1).max(4096),
  clientDedupeKey: z.uuid(),
});

export interface SendMessageState {
  error?: string;
}

/**
 * Envío manual de un agente. Aplica, en este orden: idempotencia por
 * client_dedupe_key (evita reenviar a Meta ante un reintento de red del UI),
 * consentimiento vigente, y ventana de 24h (fuera de ventana solo se permiten
 * plantillas, que se envían por otro flujo). Ninguna de estas reglas vive
 * solo en la UI.
 */
export async function sendMessage(_prev: SendMessageState | undefined, formData: FormData): Promise<SendMessageState> {
  const session = await verifySession();

  const parsed = SendMessageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
    clientDedupeKey: formData.get("clientDedupeKey"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();

  const { data: alreadySent } = await supabase
    .from("messages")
    .select("id")
    .eq("client_dedupe_key", parsed.data.clientDedupeKey)
    .maybeSingle();
  if (alreadySent) return {};

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, contact_id, phone_number_id, last_inbound_at")
    .eq("id", parsed.data.conversationId)
    .single();
  if (convError || !conversation) return { error: "Conversación no encontrada o sin acceso." };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("wa_id, consent_status")
    .eq("id", conversation.contact_id)
    .single();
  if (contactError || !contact) return { error: "Contacto no encontrado." };

  const consentCheck = assertCanContact(contact.consent_status);
  if (!consentCheck.allowed) return { error: consentCheck.reason ?? "No permitido por consentimiento." };

  const windowCheck = assertCanSendOutbound({ kind: "session", lastInboundAt: conversation.last_inbound_at });
  if (!windowCheck.allowed) return { error: windowCheck.reason ?? "Fuera de la ventana de atención." };

  try {
    const client = await getWhatsAppClientForPhoneNumber(conversation.phone_number_id);
    const response = await client.sendTextMessage({ to: contact.wa_id, body: parsed.data.body });
    const wamid = response.messages[0]?.id ?? null;

    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      wamid,
      direction: "outbound",
      sender_type: "agent",
      sender_id: session.id,
      message_type: "text",
      content: { body: parsed.data.body },
      status: "sent",
      client_dedupe_key: parsed.data.clientDedupeKey,
    });
    if (insertError) throw insertError;

    await supabase
      .from("conversations")
      .update({ last_outbound_at: new Date().toISOString() })
      .eq("id", conversation.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error enviando el mensaje." };
  }

  revalidatePath(`/inbox/${conversation.id}`);
  return {};
}

const SendTemplateSchema = z.object({
  conversationId: z.uuid(),
  templateId: z.uuid(),
  clientDedupeKey: z.uuid(),
});

export interface SendTemplateState {
  error?: string;
}

/**
 * Envío de plantilla (módulo 12): permitido tanto dentro como fuera de la
 * ventana de 24h (por eso no llama a assertCanSendOutbound con kind "session"),
 * pero sigue exigiendo consentimiento vigente y valida que estén todas las
 * variables requeridas antes de llamar al Graph API.
 */
export async function sendTemplateMessage(
  _prev: SendTemplateState | undefined,
  formData: FormData,
): Promise<SendTemplateState> {
  const session = await verifySession();

  const parsed = SendTemplateSchema.safeParse({
    conversationId: formData.get("conversationId"),
    templateId: formData.get("templateId"),
    clientDedupeKey: formData.get("clientDedupeKey"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();

  const { data: alreadySent } = await supabase
    .from("messages")
    .select("id")
    .eq("client_dedupe_key", parsed.data.clientDedupeKey)
    .maybeSingle();
  if (alreadySent) return {};

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, contact_id, phone_number_id")
    .eq("id", parsed.data.conversationId)
    .single();
  if (convError || !conversation) return { error: "Conversación no encontrada o sin acceso." };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("wa_id, consent_status")
    .eq("id", conversation.contact_id)
    .single();
  if (contactError || !contact) return { error: "Contacto no encontrado." };

  const consentCheck = assertCanContact(contact.consent_status);
  if (!consentCheck.allowed) return { error: consentCheck.reason ?? "No permitido por consentimiento." };

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("name, language, components")
    .eq("id", parsed.data.templateId)
    .single();
  if (templateError || !template) return { error: "Plantilla no encontrada." };

  const variables: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    const match = /^var_(\d+)$/.exec(key);
    const index = match?.[1];
    if (index !== undefined && typeof value === "string") variables[index] = value;
  }

  const { components, missingVariables } = renderTemplateComponents(
    template.components as unknown as StoredTemplateComponent[],
    variables,
  );
  if (missingVariables.length > 0) {
    return { error: `Faltan variables de la plantilla: ${missingVariables.join(", ")}` };
  }

  try {
    const client = await getWhatsAppClientForPhoneNumber(conversation.phone_number_id);
    const response = await client.sendTemplateMessage({
      to: contact.wa_id,
      templateName: template.name,
      languageCode: template.language,
      components,
    });
    const wamid = response.messages[0]?.id ?? null;

    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      wamid,
      direction: "outbound",
      sender_type: "agent",
      sender_id: session.id,
      message_type: "template",
      content: { templateName: template.name, variables },
      status: "sent",
      client_dedupe_key: parsed.data.clientDedupeKey,
    });
    if (insertError) throw insertError;

    await supabase
      .from("conversations")
      .update({ last_outbound_at: new Date().toISOString() })
      .eq("id", conversation.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error enviando la plantilla." };
  }

  revalidatePath(`/inbox/${conversation.id}`);
  return {};
}

/** Asignación manual (módulo 6): a un agente puntual, o null para desasignar. */
export async function assignConversation(conversationId: string, profileId: string | null): Promise<void> {
  await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("conversations").update({ assigned_to: profileId }).eq("id", conversationId);
  if (error) throw error;
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
}

export async function closeConversation(conversationId: string): Promise<void> {
  await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("conversations").update({ status: "closed" }).eq("id", conversationId);
  if (error) throw error;
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
}

/** Marca como leído al abrir el hilo (módulo bandeja): sin lectura por-agente, un timestamp global alcanza. */
export async function markConversationRead(conversationId: string): Promise<void> {
  await verifySession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) throw error;
  revalidatePath("/inbox");
}
