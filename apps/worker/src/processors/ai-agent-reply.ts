import type { SupabaseClient } from "@supabase/supabase-js";
import { Worker, type Job, type ConnectionOptions } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import { AI_AGENT_REPLY_QUEUE, assertCanContact, assertCanSendOutbound, decryptWabaToken } from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";
import { createWorkerSupabaseClient } from "../supabase";
import { getWhatsAppClientForPhoneNumber } from "../lib/whatsapp-client";

type Client = SupabaseClient<Database>;

const MCP_BETA_HEADER = "mcp-client-2025-11-20";
const HISTORY_LIMIT = 20;
// Mismo límite que la ventana de sesión de WhatsApp (24h): pasado ese tiempo sin
// mensajes, un "hola" se trata como conversación nueva en vez de retomar un tema viejo.
const HISTORY_WINDOW_HOURS = 24;
const DEFAULT_SYSTEM_PROMPT =
  "Eres un agente de servicio al cliente por WhatsApp. Responde de forma breve, clara y amable, en español.";
const NO_MARKDOWN_CONTEXT =
  "\n\n## FORMATO (regla fija, no editable desde la configuración)\n\nNUNCA uses formato Markdown (nada de **negrilla** con doble asterisco, ni # títulos, ni listas con guiones). WhatsApp no lo interpreta y el cliente vería los símbolos tal cual. Si necesitas resaltar algo, usa *negrilla* con un solo asterisco (formato nativo de WhatsApp) o simplemente texto plano.";

// Modelo fijo para el clasificador de tema: siempre el más barato, sin importar cuál tenga
// configurado la empresa para responder de verdad — es solo un filtro de sí/no.
const CLASSIFIER_MODEL = "claude-haiku-4-5";

const DEFAULT_OFF_TOPIC_REPLY =
  "Solo puedo ayudarte con temas de este negocio (agendar, consultar o cambiar una cita, servicios, horarios). Para otras consultas, un asesor te puede ayudar.";
const DEFAULT_CAP_REACHED_REPLY = "En este momento no puedo responder automáticamente — un asesor te va a contactar pronto.";

/** USD por millón de tokens. Si aparece un modelo nuevo no listado, se cobra como Sonnet
 * (precio intermedio) para no subestimar el gasto real por un modelo sin tarifa cargada. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
const FALLBACK_PRICING = { input: 2, output: 10 };

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/** Solo mensajes de texto (los de plantilla/media no tienen un `body` legible para dar contexto al modelo). */
async function buildConversationHistory(supabase: Client, conversationId: string): Promise<HistoryTurn[]> {
  const windowStart = new Date(Date.now() - HISTORY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("messages")
    .select("direction, message_type, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("message_type", "text")
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;

  const turns: HistoryTurn[] = [];
  for (const m of (data ?? []).reverse()) {
    const body = (m.content as { body?: string } | null)?.body;
    if (!body) continue;
    turns.push({ role: m.direction === "inbound" ? "user" : "assistant", content: body });
  }
  return turns;
}

function extractReplyText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
    .trim();
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

/** Registra el gasto real de una llamada a Claude (la de responder o la del clasificador de tema). */
async function logUsage(
  supabase: Client,
  companyId: string,
  conversationId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await supabase.from("ai_usage_log").insert({
    company_id: companyId,
    conversation_id: conversationId,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: estimateCostUsd(model, inputTokens, outputTokens),
  });
}

/** Suma en USD lo gastado por esta empresa desde el 1° del mes en curso (hora UTC). */
async function getMonthlyUsageUsd(supabase: Client, companyId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("ai_usage_log")
    .select("cost_usd")
    .eq("company_id", companyId)
    .gte("created_at", monthStart.toISOString());
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0);
}

/** Manda un mensaje de texto del agente (respuesta real, o uno de los mensajes fijos de
 * tope/fuera de tema) y deja el mismo rastro en `messages`/`conversations` en cualquier caso. */
async function sendAgentReply(
  supabase: Client,
  conversationId: string,
  phoneNumberRowId: string,
  waId: string,
  body: string,
): Promise<void> {
  const client = await getWhatsAppClientForPhoneNumber(supabase, phoneNumberRowId);
  const sendResponse = await client.sendTextMessage({ to: waId, body });
  const wamid = sendResponse.messages[0]?.id ?? null;

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    wamid,
    direction: "outbound",
    sender_type: "ai_agent",
    message_type: "text",
    content: { body },
    status: "sent",
  });
  await supabase.from("conversations").update({ last_outbound_at: new Date().toISOString() }).eq("id", conversationId);
}

/** Clasificador barato (Haiku fijo) para decidir si el mensaje del cliente es del tema del
 * negocio antes de gastar en el modelo configurado. Ante una respuesta ambigua, deja pasar
 * (falla abierto) para no bloquear a un cliente real por un clasificador dudoso. */
async function classifyOnTopic(
  anthropic: Anthropic,
  businessDescription: string,
  history: HistoryTurn[],
): Promise<{ onTopic: boolean; inputTokens: number; outputTokens: number }> {
  const system =
    "Eres un clasificador. Decide si el ÚLTIMO mensaje del cliente (dentro de la conversación de abajo) es sobre " +
    "el negocio descrito, o algo razonable en ese contexto (saludos, agradecimientos, seguir un tema ya iniciado), " +
    "o si es un tema completamente ajeno al negocio.\n\n## Negocio\n" +
    businessDescription +
    '\n\nResponde con una sola palabra, sin explicación: "SI" si es del negocio o razonable en ese contexto, "NO" si es un tema ajeno.';

  const response = await anthropic.messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 5,
    system,
    messages: history,
  });
  const verdict = extractReplyText(response.content).trim().toUpperCase();

  return {
    onTopic: !verdict.startsWith("NO"),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

/**
 * Genera y envía la respuesta automática del agente de IA a un mensaje entrante, si el
 * bot está activo. La conexión MCP (si hay servidores activos) la resuelve Meta... no,
 * la resuelve Anthropic server-side: las llamadas a las herramientas MCP ocurren dentro
 * de la misma respuesta, sin loop de tool-use manual de nuestro lado.
 */
export async function processAiAgentReply(supabase: Client, conversationId: string): Promise<void> {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("contact_id, phone_number_id, last_inbound_at, company_id")
    .eq("id", conversationId)
    .single();
  if (conversationError) throw conversationError;

  const { data: settings, error: settingsError } = await supabase
    .from("ai_agent_settings")
    .select(
      "id, is_enabled, anthropic_api_key_encrypted, model, system_prompt, ai_monthly_cap_usd, topic_restriction, off_topic_reply",
    )
    .eq("company_id", conversation.company_id)
    .maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings || !settings.is_enabled) return;

  // Interruptor por número (además del general de la empresa arriba): permite pausar el bot
  // en un número puntual —p. ej. uno personal de prueba— sin afectar los demás.
  const { data: phoneNumber, error: phoneNumberError } = await supabase
    .from("phone_numbers")
    .select("ai_agent_enabled")
    .eq("id", conversation.phone_number_id)
    .single();
  if (phoneNumberError) throw phoneNumberError;
  if (!phoneNumber.ai_agent_enabled) return;

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("wa_id, consent_status")
    .eq("id", conversation.contact_id)
    .single();
  if (contactError) throw contactError;

  if (!assertCanContact(contact.consent_status).allowed) return;
  if (!assertCanSendOutbound({ kind: "session", lastInboundAt: conversation.last_inbound_at }).allowed) return;

  // Tope de gasto mensual (opt-in, null = sin tope): se revisa antes de construir el
  // historial o llamar a Claude para no gastar nada más una vez la empresa se pasó.
  if (settings.ai_monthly_cap_usd != null) {
    const usedUsd = await getMonthlyUsageUsd(supabase, conversation.company_id);
    if (usedUsd >= settings.ai_monthly_cap_usd) {
      await sendAgentReply(supabase, conversationId, conversation.phone_number_id, contact.wa_id, DEFAULT_CAP_REACHED_REPLY);
      return;
    }
  }

  const history = await buildConversationHistory(supabase, conversationId);
  if (history.length === 0) return;

  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("Falta configurar WABA_TOKEN_ENCRYPTION_KEY en el servidor.");

  const anthropic = new Anthropic({ apiKey: decryptWabaToken(settings.anthropic_api_key_encrypted, encryptionKey) });
  const businessDescription = settings.system_prompt || DEFAULT_SYSTEM_PROMPT;

  // Restricción de tema (opt-in): un clasificador barato decide si vale la pena seguir antes
  // de tocar el modelo configurado (que puede ser Opus, mucho más caro que este filtro).
  if (settings.topic_restriction) {
    const classification = await classifyOnTopic(anthropic, businessDescription, history);
    await logUsage(
      supabase,
      conversation.company_id,
      conversationId,
      CLASSIFIER_MODEL,
      classification.inputTokens,
      classification.outputTokens,
    );
    if (!classification.onTopic) {
      await sendAgentReply(
        supabase,
        conversationId,
        conversation.phone_number_id,
        contact.wa_id,
        settings.off_topic_reply || DEFAULT_OFF_TOPIC_REPLY,
      );
      return;
    }
  }

  const { data: mcpServerRows, error: mcpError } = await supabase
    .from("mcp_servers")
    .select("name, url, authorization_token_encrypted")
    .eq("company_id", conversation.company_id)
    .eq("is_active", true);
  if (mcpError) throw mcpError;

  const mcpServers = (mcpServerRows ?? []).map((s) => ({
    type: "url" as const,
    name: s.name,
    url: s.url,
    ...(s.authorization_token_encrypted
      ? { authorization_token: decryptWabaToken(s.authorization_token_encrypted, encryptionKey) }
      : {}),
  }));

  const now = new Date();
  const currentDateContext = `\n\n## FECHA Y HORA ACTUALES (dato real, no lo asumas nunca)\n\nHoy es ${now.toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", year: "numeric", month: "long", day: "numeric" })}, son las ${now.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })} hora de Colombia. Usa este dato como única fuente de verdad para resolver cualquier fecha relativa ("hoy", "mañana", "el viernes", "el 13 de agosto") y para construir el año en cualquier YYYY-MM-DD que envíes a una herramienta MCP.`;
  const customerContext = `\n\n## NÚMERO DE WHATSAPP DEL CLIENTE (dato real, no lo asumas ni lo inventes)\n\nEste cliente te está escribiendo desde el número ${contact.wa_id}. Úsalo como "phone" en las herramientas MCP (list_customer_appointments, reschedule_appointment, cancel_appointment, create_appointment, log_customer_note) para buscar o registrar sus citas — no le pidas su número salvo que quiera agendar o registrar a nombre de otra persona.`;
  const system = businessDescription + currentDateContext + NO_MARKDOWN_CONTEXT + customerContext;

  const response =
    mcpServers.length > 0
      ? await anthropic.beta.messages.create({
          model: settings.model,
          max_tokens: 1024,
          system,
          messages: history,
          betas: [MCP_BETA_HEADER],
          mcp_servers: mcpServers,
          tools: mcpServers.map((s) => ({ type: "mcp_toolset" as const, mcp_server_name: s.name })),
        })
      : await anthropic.messages.create({
          model: settings.model,
          max_tokens: 1024,
          system,
          messages: history,
        });

  await logUsage(
    supabase,
    conversation.company_id,
    conversationId,
    settings.model,
    response.usage?.input_tokens ?? 0,
    response.usage?.output_tokens ?? 0,
  );

  if ((response.stop_reason as string) === "refusal") return; // el clasificador de seguridad rechazó la respuesta; no se envía nada.

  const replyText = extractReplyText(response.content);
  if (!replyText) return;

  await sendAgentReply(supabase, conversationId, conversation.phone_number_id, contact.wa_id, replyText);
}

export function createAiAgentReplyWorker(connection: ConnectionOptions): Worker {
  const supabase = createWorkerSupabaseClient();
  return new Worker(
    AI_AGENT_REPLY_QUEUE,
    async (job: Job<{ conversationId: string }>) => {
      await processAiAgentReply(supabase, job.data.conversationId);
    },
    { connection },
  );
}
