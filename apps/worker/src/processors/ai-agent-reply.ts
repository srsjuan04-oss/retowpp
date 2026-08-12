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
const DEFAULT_SYSTEM_PROMPT =
  "Eres un agente de servicio al cliente por WhatsApp. Responde de forma breve, clara y amable, en español.";

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/** Solo mensajes de texto (los de plantilla/media no tienen un `body` legible para dar contexto al modelo). */
async function buildConversationHistory(supabase: Client, conversationId: string): Promise<HistoryTurn[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("direction, message_type, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("message_type", "text")
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

/**
 * Genera y envía la respuesta automática del agente de IA a un mensaje entrante, si el
 * bot está activo. La conexión MCP (si hay servidores activos) la resuelve Meta... no,
 * la resuelve Anthropic server-side: las llamadas a las herramientas MCP ocurren dentro
 * de la misma respuesta, sin loop de tool-use manual de nuestro lado.
 */
export async function processAiAgentReply(supabase: Client, conversationId: string): Promise<void> {
  const { data: settings, error: settingsError } = await supabase
    .from("ai_agent_settings")
    .select("id, is_enabled, anthropic_api_key_encrypted, model, system_prompt")
    .maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings || !settings.is_enabled) return;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("contact_id, phone_number_id, last_inbound_at")
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
  if (!assertCanSendOutbound({ kind: "session", lastInboundAt: conversation.last_inbound_at }).allowed) return;

  const history = await buildConversationHistory(supabase, conversationId);
  if (history.length === 0) return;

  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("Falta configurar WABA_TOKEN_ENCRYPTION_KEY en el servidor.");

  const { data: mcpServerRows, error: mcpError } = await supabase
    .from("mcp_servers")
    .select("name, url, authorization_token_encrypted")
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

  const anthropic = new Anthropic({ apiKey: decryptWabaToken(settings.anthropic_api_key_encrypted, encryptionKey) });
  const now = new Date();
  const currentDateContext = `\n\n## FECHA Y HORA ACTUALES (dato real, no lo asumas nunca)\n\nHoy es ${now.toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", year: "numeric", month: "long", day: "numeric" })}, son las ${now.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })} hora de Colombia. Usa este dato como única fuente de verdad para resolver cualquier fecha relativa ("hoy", "mañana", "el viernes", "el 13 de agosto") y para construir el año en cualquier YYYY-MM-DD que envíes a una herramienta MCP.`;
  const system = (settings.system_prompt || DEFAULT_SYSTEM_PROMPT) + currentDateContext;

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

  if ((response.stop_reason as string) === "refusal") return; // el clasificador de seguridad rechazó la respuesta; no se envía nada.

  const replyText = extractReplyText(response.content);
  if (!replyText) return;

  const client = await getWhatsAppClientForPhoneNumber(supabase, conversation.phone_number_id);
  const sendResponse = await client.sendTextMessage({ to: contact.wa_id, body: replyText });
  const wamid = sendResponse.messages[0]?.id ?? null;

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    wamid,
    direction: "outbound",
    sender_type: "ai_agent",
    message_type: "text",
    content: { body: replyText },
    status: "sent",
  });
  await supabase.from("conversations").update({ last_outbound_at: new Date().toISOString() }).eq("id", conversationId);
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
