"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { encryptWabaToken } from "@reto-whatsapp/core";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: boolean;
}

const ALLOWED_MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"] as const;

const ConnectSchema = z.object({
  apiKey: z.string().optional(),
  model: z.enum(ALLOWED_MODELS, { error: "Elige un modelo válido." }),
  systemPrompt: z.string().optional(),
});

/**
 * Conecta o actualiza la configuración del agente de IA. Si ya hay una fila y no se
 * escribió una API key nueva, se deja la existente tal cual (no se sobreescribe con
 * vacío) — igual que el patrón de "dejar en blanco para no cambiar" del token de WABA.
 */
export async function connectAnthropic(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireRole("admin");

  const parsed = ConnectSchema.safeParse({
    apiKey: formData.get("apiKey") || undefined,
    model: formData.get("model"),
    systemPrompt: formData.get("systemPrompt") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) return { error: "Falta configurar WABA_TOKEN_ENCRYPTION_KEY en el servidor." };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase.from("ai_agent_settings").select("id").maybeSingle();
  if (existingError) return { error: existingError.message };

  if (!existing && !parsed.data.apiKey) {
    return { error: "La API key de Anthropic es obligatoria para conectar por primera vez." };
  }

  const baseFields = {
    model: parsed.data.model,
    system_prompt: parsed.data.systemPrompt ?? null,
  };

  if (existing) {
    const update = parsed.data.apiKey
      ? { ...baseFields, anthropic_api_key_encrypted: encryptWabaToken(parsed.data.apiKey, encryptionKey) }
      : baseFields;
    const { error } = await supabase.from("ai_agent_settings").update(update).eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("ai_agent_settings").insert({
      ...baseFields,
      anthropic_api_key_encrypted: encryptWabaToken(parsed.data.apiKey!, encryptionKey),
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/settings/ai");
  return { success: true };
}

export async function setAgentEnabled(isEnabled: boolean): Promise<ActionState> {
  await requireRole("admin");
  const supabase = await createClient();

  const { data: existing } = await supabase.from("ai_agent_settings").select("id").maybeSingle();
  if (!existing) return { error: "Conecta primero la API key de Anthropic." };

  const { error } = await supabase.from("ai_agent_settings").update({ is_enabled: isEnabled }).eq("id", existing.id);
  if (error) return { error: error.message };

  revalidatePath("/settings/ai");
  return { success: true };
}

const AddMcpServerSchema = z.object({
  name: z.string().min(1, { error: "El nombre es obligatorio." }),
  url: z.url({ error: "Ingresa una URL válida." }),
  authorizationToken: z.string().optional(),
});

/** Agrega un servidor MCP externo que el agente podrá usar como herramientas (módulo de IA). */
export async function addMcpServer(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const session = await requireRole("admin");

  const parsed = AddMcpServerSchema.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
    authorizationToken: formData.get("authorizationToken") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) return { error: "Falta configurar WABA_TOKEN_ENCRYPTION_KEY en el servidor." };

  const supabase = await createClient();
  const { error } = await supabase.from("mcp_servers").insert({
    name: parsed.data.name,
    url: parsed.data.url,
    authorization_token_encrypted: parsed.data.authorizationToken
      ? encryptWabaToken(parsed.data.authorizationToken, encryptionKey)
      : null,
    created_by: session.id,
  });
  if (error) return { error: error.code === "23505" ? "Ya existe un servidor MCP con ese nombre." : error.message };

  revalidatePath("/settings/ai");
  return { success: true };
}

export async function setMcpServerActive(id: string, isActive: boolean): Promise<ActionState> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("mcp_servers").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/ai");
  return { success: true };
}

export async function deleteMcpServer(id: string): Promise<ActionState> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("mcp_servers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/ai");
  return { success: true };
}
