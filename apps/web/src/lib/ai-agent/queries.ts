import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Cupo mensual de IA por defecto para empresas que usan la API key de la plataforma
 * (mismo valor que el default de la columna y que el worker). Solo lo muestra /plataforma. */
export const DEFAULT_AI_MONTHLY_CAP_USD = 10;

export interface AiAgentSettings {
  id: string;
  isEnabled: boolean;
  model: string;
  systemPrompt: string | null;
  topicRestriction: boolean;
  offTopicReply: string | null;
}

/** Nunca selecciona `anthropic_api_key_encrypted` ni `ai_monthly_cap_usd`: el consumo y el cupo de IA
 * son internos (solo /plataforma/empresas, con service role) y esas columnas ni siquiera son
 * legibles para `authenticated` (ver migraciones). Se filtra por empresa aunque RLS ya lo haga:
 * un administrador de plataforma ve las filas de todas y `.maybeSingle()` fallaba. */
export async function getAiAgentSettings(companyId: string): Promise<AiAgentSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_agent_settings")
    .select("id, is_enabled, model, system_prompt, topic_restriction, off_topic_reply")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    isEnabled: data.is_enabled,
    model: data.model,
    systemPrompt: data.system_prompt,
    topicRestriction: data.topic_restriction,
    offTopicReply: data.off_topic_reply,
  };
}

export interface McpServerItem {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
}

export async function listMcpServers(companyId: string): Promise<McpServerItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcp_servers")
    .select("id, name, url, is_active, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, url: s.url, isActive: s.is_active, createdAt: s.created_at }));
}
