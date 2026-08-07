import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AiAgentSettings {
  id: string;
  isEnabled: boolean;
  model: string;
  systemPrompt: string | null;
}

/** Nunca selecciona `anthropic_api_key_encrypted`: la columna ni siquiera es legible para `authenticated` (ver migración). */
export async function getAiAgentSettings(): Promise<AiAgentSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_agent_settings")
    .select("id, is_enabled, model, system_prompt")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, isEnabled: data.is_enabled, model: data.model, systemPrompt: data.system_prompt };
}

export interface McpServerItem {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
}

export async function listMcpServers(): Promise<McpServerItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcp_servers")
    .select("id, name, url, is_active, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, url: s.url, isActive: s.is_active, createdAt: s.created_at }));
}
