import type { SupabaseClient } from "@supabase/supabase-js";
import { Worker, type Job, type ConnectionOptions } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaToolUnion,
  BetaToolUseBlock,
  BetaUsage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { AI_AGENT_REPLY_QUEUE, assertCanContact, assertCanSendOutbound, decryptWabaToken } from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";
import { createWorkerSupabaseClient } from "../supabase";
import { getWhatsAppClientForPhoneNumber } from "../lib/whatsapp-client";
import { callMcpTool, listMcpTools, type McpServerConnection, type McpToolDefinition } from "../lib/mcp-client";

type Client = SupabaseClient<Database>;

const MCP_BETA_HEADER = "mcp-client-2025-11-20";
const HISTORY_LIMIT = 20;
// Mismo límite que la ventana de sesión de WhatsApp (24h): pasado ese tiempo sin
// mensajes, un "hola" se trata como conversación nueva en vez de retomar un tema viejo.
const HISTORY_WINDOW_HOURS = 24;
// Respuestas en paralelo entre conversaciones distintas. Con el default de BullMQ (1), un
// cliente esperaba a que terminara la respuesta completa (con MCP, 10-30 s) de cualquier otro.
const AI_REPLY_CONCURRENCY = 10;
// Esfuerzo de razonamiento: Sonnet/Opus 5 piensan en "high" si no se indica, lo que hace más
// lenta y cara cada respuesta; "medium" alcanza para agendar/consultar citas por WhatsApp.
const REPLY_EFFORT = "medium";
// Tope de vueltas del loop de herramientas propias (log_customer_note) y de pause_turn.
const MAX_AGENT_TURNS = 4;
const DEFAULT_SYSTEM_PROMPT =
  "Eres un agente de servicio al cliente por WhatsApp. Responde de forma breve, clara y amable, en español.";
const NO_MARKDOWN_CONTEXT =
  "\n\n## FORMATO (regla fija, no editable desde la configuración)\n\nNUNCA uses formato Markdown (nada de **negrilla** con doble asterisco, ni # títulos, ni listas con guiones). WhatsApp no lo interpreta y el cliente vería los símbolos tal cual. Si necesitas resaltar algo, usa *negrilla* con un solo asterisco (formato nativo de WhatsApp) o simplemente texto plano.";
const SINGLE_MESSAGE_CONTEXT =
  "\n\n## UN SOLO MENSAJE POR TURNO (regla fija, no editable desde la configuración)\n\nCada mensaje de WhatsApp que envías tiene costo. Responde TODO lo que el cliente pidió en un único mensaje (si escribió varios mensajes seguidos, contéstalos juntos). No anuncies que vas a consultar algo (\"déjame revisar\", \"un momento\"): consulta las herramientas primero y responde ya con el resultado.";

// Herramienta MCP que el worker ejecuta por su cuenta (en vez del conector de Anthropic) para
// poder agregarle al resumen el costo real de Claude de la conversación.
const NOTE_TOOL_NAME = "log_customer_note";

// Modelo fijo para el clasificador de tema: siempre el más barato, sin importar cuál tenga
// configurado la empresa para responder de verdad — es solo un filtro de sí/no.
const CLASSIFIER_MODEL = "claude-haiku-4-5";
// El clasificador solo necesita el final de la conversación para decidir el tema.
const CLASSIFIER_HISTORY_TURNS = 6;

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
// Multiplicadores sobre el precio de entrada del caché de prompt (TTL de 5 minutos).
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

type UsageLike = Pick<BetaUsage, "input_tokens" | "output_tokens"> &
  Partial<Pick<BetaUsage, "cache_creation_input_tokens" | "cache_read_input_tokens">>;

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

/** wamid del último mensaje de texto entrante: si no es el que disparó este job, el cliente
 * siguió escribiendo y el job de ese mensaje más nuevo responde todo junto. */
async function getLatestInboundTextWamid(supabase: Client, conversationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("wamid")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .eq("message_type", "text")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.wamid ?? null;
}

/** Texto del último mensaje que mandó el agente, para no repetir un mensaje fijo (tope o
 * fuera de tema) una y otra vez — cada mensaje enviado cuesta. */
async function getLastAgentMessageBody(supabase: Client, conversationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("content")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.content as { body?: string } | null)?.body ?? null;
}

function extractReplyText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
    .trim();
}

function estimateCostUsd(model: string, usage: UsageLike): number {
  const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  const inputUsd =
    (usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) * CACHE_WRITE_MULTIPLIER +
      (usage.cache_read_input_tokens ?? 0) * CACHE_READ_MULTIPLIER) *
    pricing.input;
  return (inputUsd + usage.output_tokens * pricing.output) / 1_000_000;
}

/** Registra el gasto real de una llamada a Claude (la de responder o la del clasificador de tema). */
async function logUsage(
  supabase: Client,
  companyId: string,
  conversationId: string,
  model: string,
  usage: UsageLike,
): Promise<void> {
  await supabase.from("ai_usage_log").insert({
    company_id: companyId,
    conversation_id: conversationId,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cost_usd: estimateCostUsd(model, usage),
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

/** Gasto en Claude de esta conversación dentro de la misma ventana que ve el modelo (24h),
 * incluidas las llamadas de la respuesta en curso (se registran antes de ejecutar la nota). */
async function getConversationUsageUsd(supabase: Client, conversationId: string): Promise<number> {
  const windowStart = new Date(Date.now() - HISTORY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ai_usage_log")
    .select("cost_usd")
    .eq("conversation_id", conversationId)
    .gte("created_at", windowStart);
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

/** Igual que sendAgentReply, pero no repite el mismo mensaje fijo si ya fue lo último enviado. */
async function sendCannedReplyOnce(
  supabase: Client,
  conversationId: string,
  phoneNumberRowId: string,
  waId: string,
  body: string,
): Promise<void> {
  if ((await getLastAgentMessageBody(supabase, conversationId)) === body) return;
  await sendAgentReply(supabase, conversationId, phoneNumberRowId, waId, body);
}

/** Clasificador barato (Haiku fijo) para decidir si el mensaje del cliente es del tema del
 * negocio antes de gastar en el modelo configurado. Ante una respuesta ambigua, deja pasar
 * (falla abierto) para no bloquear a un cliente real por un clasificador dudoso. */
async function classifyOnTopic(
  anthropic: Anthropic,
  businessDescription: string,
  history: HistoryTurn[],
): Promise<{ onTopic: boolean; usage: UsageLike }> {
  const system =
    "Eres un clasificador. Decide si el ÚLTIMO mensaje del cliente (dentro de la conversación de abajo) es sobre " +
    "el negocio descrito, o algo razonable en ese contexto (saludos, agradecimientos, seguir un tema ya iniciado), " +
    "o si es un tema completamente ajeno al negocio.\n\n## Negocio\n" +
    businessDescription +
    '\n\nResponde con una sola palabra, sin explicación: "SI" si es del negocio o razonable en ese contexto, "NO" si es un tema ajeno.';

  // El historial tiene que empezar con un turno del cliente.
  let recent = history.slice(-CLASSIFIER_HISTORY_TURNS);
  const firstUser = recent.findIndex((turn) => turn.role === "user");
  recent = firstUser === -1 ? history : recent.slice(firstUser);

  const response = await anthropic.messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 5,
    system,
    messages: recent,
  });
  const verdict = extractReplyText(response.content).trim().toUpperCase();

  return { onTopic: !verdict.startsWith("NO"), usage: response.usage };
}

interface ReplyContext {
  supabase: Client;
  anthropic: Anthropic;
  model: string;
  companyId: string;
  conversationId: string;
  customerPhone: string;
  system: Anthropic.Beta.BetaTextBlockParam[];
  history: HistoryTurn[];
  mcpServers: McpServerConnection[];
  signal: AbortSignal;
}

/** Busca qué servidor MCP activo expone log_customer_note. Si falla el listado, se sigue sin
 * interceptar la nota (el conector de Anthropic la ejecuta como antes, sin el costo). */
async function findNoteTool(
  servers: McpServerConnection[],
): Promise<{ server: McpServerConnection; tool: McpToolDefinition } | null> {
  const results = await Promise.all(
    servers.map(async (server) => {
      try {
        const tool = (await listMcpTools(server)).find((t) => t.name === NOTE_TOOL_NAME);
        return tool ? { server, tool } : null;
      } catch (error) {
        console.error(`[ai-agent-reply] no se pudo listar herramientas de ${server.name}`, error);
        return null;
      }
    }),
  );
  return results.find((r) => r !== null) ?? null;
}

function formatUsd(amount: number): string {
  return `US$${amount.toFixed(amount < 1 ? 4 : 2)}`;
}

/**
 * Genera la respuesta del agente. La conexión MCP la resuelve Anthropic server-side (las
 * llamadas a las herramientas ocurren dentro de la misma respuesta); la única excepción es
 * log_customer_note, que se declara como herramienta propia para agregarle al resumen el
 * costo de Claude de la conversación antes de mandarlo al servidor MCP.
 */
interface ReplyStats {
  claudeMs: number;
  claudeCalls: number;
  mcpToolCalls: number;
  cacheReadTokens: number;
}

async function generateReply(
  ctx: ReplyContext,
): Promise<{ text: string; usedTools: boolean; stats: ReplyStats } | null> {
  const noteTool = ctx.mcpServers.length > 0 ? await findNoteTool(ctx.mcpServers) : null;

  const tools: BetaToolUnion[] = ctx.mcpServers.map((s) => ({
    type: "mcp_toolset" as const,
    mcp_server_name: s.name,
    ...(noteTool?.server === s ? { configs: { [NOTE_TOOL_NAME]: { enabled: false } } } : {}),
  }));
  if (noteTool) {
    const { $schema: _ignored, ...inputSchema } = noteTool.tool.inputSchema;
    tools.push({
      name: NOTE_TOOL_NAME,
      description: noteTool.tool.description ?? "Registra en el historial del cliente un resumen de la conversación.",
      input_schema: { type: "object", ...inputSchema },
    });
  }

  const messages: BetaMessageParam[] = [...ctx.history];
  const texts: string[] = [];
  let usedTools = false;
  const stats: ReplyStats = { claudeMs: 0, claudeCalls: 0, mcpToolCalls: 0, cacheReadTokens: 0 };

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const callStartedAt = Date.now();
    const response = await ctx.anthropic.beta.messages.create(
      {
        model: ctx.model,
        max_tokens: 1024,
        system: ctx.system,
        messages,
        ...(ctx.model.startsWith("claude-haiku") ? {} : { output_config: { effort: REPLY_EFFORT } }),
        ...(ctx.mcpServers.length > 0
          ? {
              betas: [MCP_BETA_HEADER],
              mcp_servers: ctx.mcpServers.map((s) => ({
                type: "url" as const,
                name: s.name,
                url: s.url,
                ...(s.authorizationToken ? { authorization_token: s.authorizationToken } : {}),
              })),
            }
          : {}),
        ...(tools.length > 0 ? { tools } : {}),
      },
      { signal: ctx.signal },
    );
    stats.claudeMs += Date.now() - callStartedAt;
    stats.claudeCalls += 1;
    stats.mcpToolCalls += response.content.filter((b) => b.type === "mcp_tool_use").length;
    stats.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    await logUsage(ctx.supabase, ctx.companyId, ctx.conversationId, ctx.model, response.usage);

    if ((response.stop_reason as string) === "refusal") return null; // el clasificador de seguridad rechazó la respuesta; no se envía nada.

    if (response.content.some((b) => b.type === "mcp_tool_use" || b.type === "tool_use")) usedTools = true;
    const text = extractReplyText(response.content);
    if (text) texts.push(text);

    // pause_turn: el loop server-side de MCP se cortó a mitad; se reenvía para que continúe.
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason !== "tool_use" || !noteTool) break;

    const noteCalls = response.content.filter(
      (b: BetaContentBlock): b is BetaToolUseBlock => b.type === "tool_use" && b.name === NOTE_TOOL_NAME,
    );
    if (noteCalls.length === 0) break;
    if (ctx.signal.aborted) return null;

    const costUsd = await getConversationUsageUsd(ctx.supabase, ctx.conversationId);
    const toolResults = await Promise.all(
      noteCalls.map(async (call) => {
        const input = { ...(call.input as Record<string, unknown>) };
        if (!input.phone && !input.customer_id) input.phone = ctx.customerPhone;
        input.summary = `${String(input.summary ?? "").trim()}\n\nCosto IA (Claude) de esta conversación: ${formatUsd(costUsd)}`;
        try {
          const result = await callMcpTool(noteTool.server, NOTE_TOOL_NAME, input);
          return { type: "tool_result" as const, tool_use_id: call.id, content: result.text, is_error: result.isError };
        } catch (error) {
          console.error("[ai-agent-reply] falló log_customer_note", error);
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            content: error instanceof Error ? error.message : "Error registrando la nota",
            is_error: true,
          };
        }
      }),
    );

    // Si el modelo ya escribió la respuesta al cliente antes de pedir la nota (lo normal: la
    // registra en la misma respuesta en que confirma), no hace falta otra llamada a Claude
    // solo para cerrar el turno — ahorra tiempo y tokens.
    if (text) break;
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  const replyText = texts.join("\n").trim();
  return replyText ? { text: replyText, usedTools, stats } : null;
}

/**
 * Genera y envía la respuesta automática del agente de IA a un mensaje entrante, si el
 * bot está activo. `inboundWamid` es el mensaje que disparó el job (se encola con una
 * pequeña espera): si el cliente mandó otro después, este job no responde y el del mensaje
 * más nuevo contesta todo en un solo mensaje — menos mensajes enviados y menos llamadas a Claude.
 */
export async function processAiAgentReply(supabase: Client, conversationId: string, inboundWamid?: string): Promise<void> {
  const startedAt = Date.now();
  const [conversationResult, latestWamid] = await Promise.all([
    supabase
      .from("conversations")
      .select("contact_id, phone_number_id, last_inbound_at, company_id")
      .eq("id", conversationId)
      .single(),
    inboundWamid ? getLatestInboundTextWamid(supabase, conversationId) : Promise.resolve(null),
  ]);
  if (conversationResult.error) throw conversationResult.error;
  const conversation = conversationResult.data;
  if (inboundWamid && latestWamid && latestWamid !== inboundWamid) return;

  const [settingsResult, phoneNumberResult, contactResult] = await Promise.all([
    supabase
      .from("ai_agent_settings")
      .select(
        "id, is_enabled, anthropic_api_key_encrypted, model, system_prompt, ai_monthly_cap_usd, topic_restriction, off_topic_reply",
      )
      .eq("company_id", conversation.company_id)
      .maybeSingle(),
    // Interruptor por número (además del general de la empresa): permite pausar el bot
    // en un número puntual —p. ej. uno personal de prueba— sin afectar los demás.
    supabase.from("phone_numbers").select("ai_agent_enabled").eq("id", conversation.phone_number_id).single(),
    supabase.from("contacts").select("wa_id, consent_status").eq("id", conversation.contact_id).single(),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (phoneNumberResult.error) throw phoneNumberResult.error;
  if (contactResult.error) throw contactResult.error;
  const settings = settingsResult.data;
  const contact = contactResult.data;
  if (!settings || !settings.is_enabled) return;
  if (!phoneNumberResult.data.ai_agent_enabled) return;

  if (!assertCanContact(contact.consent_status).allowed) return;
  if (!assertCanSendOutbound({ kind: "session", lastInboundAt: conversation.last_inbound_at }).allowed) return;

  const [usedUsd, history, mcpResult] = await Promise.all([
    // Tope de gasto mensual (opt-in, null = sin tope).
    settings.ai_monthly_cap_usd != null ? getMonthlyUsageUsd(supabase, conversation.company_id) : Promise.resolve(0),
    buildConversationHistory(supabase, conversationId),
    supabase
      .from("mcp_servers")
      .select("name, url, authorization_token_encrypted")
      .eq("company_id", conversation.company_id)
      .eq("is_active", true),
  ]);
  if (mcpResult.error) throw mcpResult.error;

  if (settings.ai_monthly_cap_usd != null && usedUsd >= settings.ai_monthly_cap_usd) {
    await sendCannedReplyOnce(supabase, conversationId, conversation.phone_number_id, contact.wa_id, DEFAULT_CAP_REACHED_REPLY);
    return;
  }
  if (history.length === 0) return;

  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("Falta configurar WABA_TOKEN_ENCRYPTION_KEY en el servidor.");

  const anthropic = new Anthropic({ apiKey: decryptWabaToken(settings.anthropic_api_key_encrypted, encryptionKey) });
  const businessDescription = settings.system_prompt || DEFAULT_SYSTEM_PROMPT;

  const mcpServers: McpServerConnection[] = (mcpResult.data ?? []).map((s) => ({
    name: s.name,
    url: s.url,
    ...(s.authorization_token_encrypted
      ? { authorizationToken: decryptWabaToken(s.authorization_token_encrypted, encryptionKey) }
      : {}),
  }));

  const now = new Date();
  const currentDateContext = `## FECHA Y HORA ACTUALES (dato real, no lo asumas nunca)\n\nHoy es ${now.toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", year: "numeric", month: "long", day: "numeric" })}, son las ${now.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })} hora de Colombia. Usa este dato como única fuente de verdad para resolver cualquier fecha relativa ("hoy", "mañana", "el viernes", "el 13 de agosto") y para construir el año en cualquier YYYY-MM-DD que envíes a una herramienta MCP.`;
  const customerContext = `\n\n## NÚMERO DE WHATSAPP DEL CLIENTE (dato real, no lo asumas ni lo inventes)\n\nEste cliente te está escribiendo desde el número ${contact.wa_id}. Úsalo como "phone" en las herramientas MCP (list_customer_appointments, reschedule_appointment, cancel_appointment, create_appointment, log_customer_note) para buscar o registrar sus citas — no le pidas su número salvo que quiera agendar o registrar a nombre de otra persona.`;
  // Lo fijo va primero y con marca de caché (junto con las definiciones de herramientas, que
  // van antes del system): se cobra ~10% en las siguientes llamadas y responde más rápido. La
  // fecha/hora y el número cambian por mensaje, así que van después de la marca.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    {
      type: "text",
      text: businessDescription + NO_MARKDOWN_CONTEXT + SINGLE_MESSAGE_CONTEXT,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: currentDateContext + customerContext },
  ];

  // El clasificador de tema (opt-in) corre en paralelo con la respuesta en vez de antes, para
  // no sumar su latencia a cada mensaje; si dice que es fuera de tema, se cancela la respuesta.
  const controller = new AbortController();
  const prepMs = Date.now() - startedAt;
  const replyPromise = generateReply({
    supabase,
    anthropic,
    model: settings.model,
    companyId: conversation.company_id,
    conversationId,
    customerPhone: contact.wa_id,
    system,
    history,
    mcpServers,
    signal: controller.signal,
  });
  // Evita que un error de la respuesta mientras se espera al clasificador quede como
  // "unhandled rejection"; el `await replyPromise` de abajo igual lo relanza.
  replyPromise.catch(() => null);

  if (settings.topic_restriction) {
    let onTopic = true;
    try {
      const classification = await classifyOnTopic(anthropic, businessDescription, history);
      await logUsage(supabase, conversation.company_id, conversationId, CLASSIFIER_MODEL, classification.usage);
      onTopic = classification.onTopic;
    } catch (error) {
      console.error("[ai-agent-reply] falló el clasificador de tema; se deja pasar", error);
    }
    if (!onTopic) {
      controller.abort();
      await replyPromise.catch(() => null);
      await sendCannedReplyOnce(
        supabase,
        conversationId,
        conversation.phone_number_id,
        contact.wa_id,
        settings.off_topic_reply || DEFAULT_OFF_TOPIC_REPLY,
      );
      return;
    }
  }

  const reply = await replyPromise;
  if (!reply) return;

  // Si el cliente escribió de nuevo mientras se generaba la respuesta, el job de ese mensaje
  // contesta todo junto; esta se descarta para no mandar dos mensajes seguidos. Solo si no
  // tocó herramientas: si ya agendó/canceló algo, el cliente tiene que ver la confirmación.
  if (inboundWamid && !reply.usedTools && (await getLatestInboundTextWamid(supabase, conversationId)) !== inboundWamid) {
    return;
  }

  const sendStartedAt = Date.now();
  await sendAgentReply(supabase, conversationId, conversation.phone_number_id, contact.wa_id, reply.text);

  // Medición por etapas para saber dónde se va el tiempo de cada respuesta (logs de Railway).
  const { stats } = reply;
  console.log(
    `[ai-agent-reply] conv ${conversationId}: total ${Date.now() - startedAt}ms | prep ${prepMs}ms | ` +
      `claude ${stats.claudeMs}ms (${stats.claudeCalls} llamadas, ${stats.mcpToolCalls} herramientas MCP, ` +
      `${stats.cacheReadTokens} tokens de caché) | envío ${Date.now() - sendStartedAt}ms`,
  );
}

export function createAiAgentReplyWorker(connection: ConnectionOptions): Worker {
  const supabase = createWorkerSupabaseClient();
  return new Worker(
    AI_AGENT_REPLY_QUEUE,
    async (job: Job<{ conversationId: string; inboundWamid?: string }>) => {
      await processAiAgentReply(supabase, job.data.conversationId, job.data.inboundWamid);
    },
    { connection, concurrency: AI_REPLY_CONCURRENCY },
  );
}
