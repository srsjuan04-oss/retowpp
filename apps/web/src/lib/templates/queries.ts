import "server-only";
import type { StoredTemplateComponent } from "@reto-whatsapp/core";
import { createClient } from "@/lib/supabase/server";

export interface TemplateOption {
  id: string;
  name: string;
  language: string;
  components: StoredTemplateComponent[];
}

export async function listApprovedTemplates(): Promise<TemplateOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, language, components")
    .eq("status", "approved")
    .order("name");
  if (error) throw error;

  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    language: t.language,
    components: t.components as unknown as StoredTemplateComponent[],
  }));
}

export interface SyncedTemplate extends TemplateOption {
  status: string;
  lastSyncedAt: string;
  wabaAccountId: string;
  wabaBusinessName: string;
}

/** Consultas separadas en vez de embedding de recursos: ver nota en lib/inbox/queries.ts. */
export async function listAllTemplates(): Promise<SyncedTemplate[]> {
  const supabase = await createClient();
  const { data: templates, error } = await supabase
    .from("templates")
    .select("id, name, language, status, components, last_synced_at, waba_account_id")
    .order("name");
  if (error) throw error;
  if (!templates || templates.length === 0) return [];

  const wabaIds = [...new Set(templates.map((t) => t.waba_account_id))];
  const { data: wabas, error: wabasError } = await supabase
    .from("waba_accounts")
    .select("id, business_name")
    .in("id", wabaIds);
  if (wabasError) throw wabasError;
  const wabaNameById = new Map((wabas ?? []).map((w) => [w.id, w.business_name]));

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    language: t.language,
    status: t.status,
    lastSyncedAt: t.last_synced_at,
    components: t.components as unknown as StoredTemplateComponent[],
    wabaAccountId: t.waba_account_id,
    wabaBusinessName: wabaNameById.get(t.waba_account_id) ?? "—",
  }));
}
