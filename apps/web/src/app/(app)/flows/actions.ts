"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: boolean;
}

const CreateFlowSchema = z.object({
  name: z.string().min(1, { error: "El nombre es obligatorio." }),
  wabaAccountId: z.uuid({ error: "Elige una WABA." }),
  templateId: z.uuid({ error: "Elige una plantilla." }),
});

/** Crea el flujo inactivo (sin pasos todavía); se arma desde /flows/[flowId]. */
export async function createFlow(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const session = await requireRole("admin");
  if (!session.companyId) return { error: "Tu usuario no pertenece a ninguna empresa." };

  const parsed = CreateFlowSchema.safeParse({
    name: formData.get("name"),
    wabaAccountId: formData.get("wabaAccountId"),
    templateId: formData.get("templateId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("waba_account_id")
    .eq("id", parsed.data.templateId)
    .maybeSingle();
  if (templateError) return { error: templateError.message };
  if (!template || template.waba_account_id !== parsed.data.wabaAccountId) {
    return { error: "La plantilla elegida no pertenece a esa WABA." };
  }

  const { data: flow, error } = await supabase
    .from("flows")
    .insert({
      name: parsed.data.name,
      waba_account_id: parsed.data.wabaAccountId,
      template_id: parsed.data.templateId,
      company_id: session.companyId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/flows");
  redirect(`/flows/${flow.id}`);
}

const AddStepSchema = z.object({
  flowId: z.uuid(),
  contentType: z.enum(["text", "image", "audio"], { error: "Elige un tipo de contenido." }),
  textBody: z.string().optional(),
});

/** Sube el archivo (si aplica) a Storage y agrega el paso al final del flujo. */
export async function addStep(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireRole("admin");

  const parsed = AddStepSchema.safeParse({
    flowId: formData.get("flowId"),
    contentType: formData.get("contentType"),
    textBody: formData.get("textBody") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { flowId, contentType } = parsed.data;

  const supabase = await createClient();

  let textBody: string | null = null;
  let mediaPath: string | null = null;
  let mediaMimeType: string | null = null;

  if (contentType === "text") {
    if (!parsed.data.textBody) return { error: "Escribe el texto del mensaje." };
    textBody = parsed.data.textBody;
  } else {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: contentType === "image" ? "Selecciona una imagen." : "Selecciona un audio." };
    }
    const expectedPrefix = contentType === "image" ? "image/" : "audio/";
    if (!file.type.startsWith(expectedPrefix)) {
      return { error: `El archivo debe ser de tipo ${expectedPrefix}*.` };
    }

    const path = `${flowId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("flow-media").upload(path, file, {
      contentType: file.type,
    });
    if (uploadError) return { error: `No se pudo subir el archivo: ${uploadError.message}` };
    mediaPath = path;
    mediaMimeType = file.type;
  }

  const { data: lastStep } = await supabase
    .from("flow_steps")
    .select("step_order")
    .eq("flow_id", flowId)
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (lastStep?.step_order ?? 0) + 1;

  const { error } = await supabase.from("flow_steps").insert({
    flow_id: flowId,
    step_order: nextOrder,
    content_type: contentType,
    text_body: textBody,
    media_path: mediaPath,
    media_mime_type: mediaMimeType,
  });
  if (error) return { error: error.message };

  revalidatePath(`/flows/${flowId}`);
  return { success: true };
}

/** Elimina un paso; las ramas que salen de él se borran en cascada y las que apuntaban a él quedan sin destino (fin de flujo). */
export async function deleteStep(flowId: string, stepId: string): Promise<ActionState> {
  await requireRole("admin");
  const supabase = await createClient();

  const { error } = await supabase.from("flow_steps").delete().eq("id", stepId);
  if (error) return { error: error.message };

  revalidatePath(`/flows/${flowId}`);
  return { success: true };
}

const AddBranchSchema = z.object({
  flowId: z.uuid(),
  fromStepId: z.uuid(),
  matchType: z.enum(["any", "equals", "contains"], { error: "Elige una condición." }),
  matchValue: z.string().optional(),
  toStepId: z.string().optional(),
  priority: z.coerce.number().int().default(0),
});

/** Agrega una rama de decisión desde un paso: a qué paso continúa (o termina el flujo) según lo que responda el contacto. */
export async function addBranch(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireRole("admin");

  const parsed = AddBranchSchema.safeParse({
    flowId: formData.get("flowId"),
    fromStepId: formData.get("fromStepId"),
    matchType: formData.get("matchType"),
    matchValue: formData.get("matchValue") || undefined,
    toStepId: formData.get("toStepId") || undefined,
    priority: formData.get("priority") || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { flowId, fromStepId, matchType, toStepId, priority } = parsed.data;

  if (matchType !== "any" && !parsed.data.matchValue) {
    return { error: "Escribe el texto que debe coincidir." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("flow_branches").insert({
    from_step_id: fromStepId,
    match_type: matchType,
    match_value: matchType === "any" ? null : (parsed.data.matchValue ?? null),
    to_step_id: toStepId || null,
    priority,
  });
  if (error) return { error: error.message };

  revalidatePath(`/flows/${flowId}`);
  return { success: true };
}

export async function deleteBranch(flowId: string, branchId: string): Promise<ActionState> {
  await requireRole("admin");
  const supabase = await createClient();

  const { error } = await supabase.from("flow_branches").delete().eq("id", branchId);
  if (error) return { error: error.message };

  revalidatePath(`/flows/${flowId}`);
  return { success: true };
}

/** Activa o desactiva el flujo. Al activar: exige al menos un paso y depende del índice único parcial (un solo flujo activo por plantilla) para evitar ambigüedad. */
export async function setFlowActive(flowId: string, isActive: boolean): Promise<ActionState> {
  await requireRole("admin");
  const supabase = await createClient();

  if (isActive) {
    const { count, error: countError } = await supabase
      .from("flow_steps")
      .select("id", { count: "exact", head: true })
      .eq("flow_id", flowId);
    if (countError) return { error: countError.message };
    if (!count) return { error: "Agrega al menos un paso antes de activar el flujo." };
  }

  const { error } = await supabase.from("flows").update({ is_active: isActive }).eq("id", flowId);
  if (error) {
    if (error.code === "23505") {
      return { error: "Ya hay otro flujo activo para esta plantilla. Desactívalo primero." };
    }
    return { error: error.message };
  }

  revalidatePath(`/flows/${flowId}`);
  revalidatePath("/flows");
  return { success: true };
}
