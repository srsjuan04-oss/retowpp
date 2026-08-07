import "server-only";
import type { Database } from "@reto-whatsapp/db";
import { createClient } from "@/lib/supabase/server";

type FlowStepContentType = Database["public"]["Enums"]["flow_step_content_type"];
type FlowBranchMatchType = Database["public"]["Enums"]["flow_branch_match_type"];

export interface WabaOption {
  id: string;
  businessName: string;
}

export async function listActiveWabaAccounts(): Promise<WabaOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("waba_accounts")
    .select("id, business_name")
    .eq("is_active", true)
    .order("business_name");
  if (error) throw error;
  return (data ?? []).map((w) => ({ id: w.id, businessName: w.business_name }));
}

export interface FlowTemplateOption {
  id: string;
  name: string;
  language: string;
  wabaAccountId: string;
}

/** Solo plantillas aprobadas: un flujo dispara al responder a un envío real, que solo puede ser de una plantilla aprobada. */
export async function listApprovedTemplatesForFlows(): Promise<FlowTemplateOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, language, waba_account_id")
    .eq("status", "approved")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, language: t.language, wabaAccountId: t.waba_account_id }));
}

export interface FlowListItem {
  id: string;
  name: string;
  isActive: boolean;
  templateName: string;
  wabaBusinessName: string;
  createdAt: string;
}

/** Consultas separadas en vez de embedding de recursos: ver nota en lib/inbox/queries.ts. */
export async function listFlows(): Promise<FlowListItem[]> {
  const supabase = await createClient();

  const { data: flows, error } = await supabase
    .from("flows")
    .select("id, name, is_active, template_id, waba_account_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!flows || flows.length === 0) return [];

  const templateIds = [...new Set(flows.map((f) => f.template_id))];
  const wabaIds = [...new Set(flows.map((f) => f.waba_account_id))];

  const [{ data: templates, error: templatesError }, { data: wabas, error: wabasError }] = await Promise.all([
    supabase.from("templates").select("id, name").in("id", templateIds),
    supabase.from("waba_accounts").select("id, business_name").in("id", wabaIds),
  ]);
  if (templatesError) throw templatesError;
  if (wabasError) throw wabasError;

  const templateNameById = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const wabaNameById = new Map((wabas ?? []).map((w) => [w.id, w.business_name]));

  return flows.map((f) => ({
    id: f.id,
    name: f.name,
    isActive: f.is_active,
    templateName: templateNameById.get(f.template_id) ?? "—",
    wabaBusinessName: wabaNameById.get(f.waba_account_id) ?? "—",
    createdAt: f.created_at,
  }));
}

export interface FlowStepItem {
  id: string;
  order: number;
  contentType: FlowStepContentType;
  textBody: string | null;
  mediaPath: string | null;
  mediaMimeType: string | null;
  mediaSignedUrl: string | null;
}

export interface FlowBranchItem {
  id: string;
  fromStepId: string;
  matchType: FlowBranchMatchType;
  matchValue: string | null;
  toStepId: string | null;
  priority: number;
}

export interface FlowDetail {
  id: string;
  name: string;
  isActive: boolean;
  templateId: string;
  templateName: string;
  wabaAccountId: string;
  wabaBusinessName: string;
  steps: FlowStepItem[];
  branches: FlowBranchItem[];
}

export async function getFlow(flowId: string): Promise<FlowDetail | null> {
  const supabase = await createClient();

  const { data: flow, error } = await supabase
    .from("flows")
    .select("id, name, is_active, template_id, waba_account_id")
    .eq("id", flowId)
    .maybeSingle();
  if (error) throw error;
  if (!flow) return null;

  const [{ data: template }, { data: waba }, { data: stepRowsRaw, error: stepsError }] = await Promise.all([
    supabase.from("templates").select("name").eq("id", flow.template_id).maybeSingle(),
    supabase.from("waba_accounts").select("business_name").eq("id", flow.waba_account_id).maybeSingle(),
    supabase
      .from("flow_steps")
      .select("id, step_order, content_type, text_body, media_path, media_mime_type")
      .eq("flow_id", flowId)
      .order("step_order"),
  ]);
  if (stepsError) throw stepsError;
  const stepRows = stepRowsRaw ?? [];

  const steps: FlowStepItem[] = await Promise.all(
    stepRows.map(async (s) => {
      let mediaSignedUrl: string | null = null;
      if (s.media_path) {
        const { data: signed } = await supabase.storage.from("flow-media").createSignedUrl(s.media_path, 3600);
        mediaSignedUrl = signed?.signedUrl ?? null;
      }
      return {
        id: s.id,
        order: s.step_order,
        contentType: s.content_type,
        textBody: s.text_body,
        mediaPath: s.media_path,
        mediaMimeType: s.media_mime_type,
        mediaSignedUrl,
      };
    }),
  );

  let branches: FlowBranchItem[] = [];
  if (stepRows.length > 0) {
    const { data: branchRows, error: branchError } = await supabase
      .from("flow_branches")
      .select("id, from_step_id, match_type, match_value, to_step_id, priority")
      .in(
        "from_step_id",
        stepRows.map((s) => s.id),
      )
      .order("priority");
    if (branchError) throw branchError;
    branches = (branchRows ?? []).map((b) => ({
      id: b.id,
      fromStepId: b.from_step_id,
      matchType: b.match_type,
      matchValue: b.match_value,
      toStepId: b.to_step_id,
      priority: b.priority,
    }));
  }

  return {
    id: flow.id,
    name: flow.name,
    isActive: flow.is_active,
    templateId: flow.template_id,
    templateName: template?.name ?? "—",
    wabaAccountId: flow.waba_account_id,
    wabaBusinessName: waba?.business_name ?? "—",
    steps,
    branches,
  };
}
