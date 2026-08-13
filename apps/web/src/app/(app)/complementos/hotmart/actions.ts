"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
}

const CreateHotmartWebhookSchema = z.object({
  name: z.string().min(1, { error: "El nombre es obligatorio." }),
  event: z.enum(["PURCHASE_APPROVED", "PURCHASE_CANCELED", "PURCHASE_OUT_OF_SHOPPING_CART"]),
  templateId: z.uuid(),
  phoneNumberId: z.uuid(),
});

/** Crea una "receta" evento de Hotmart -> plantilla de WhatsApp (módulo complementos). */
export async function createHotmartWebhook(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const session = await requireRole("admin");

  const parsed = CreateHotmartWebhookSchema.safeParse({
    name: formData.get("name"),
    event: formData.get("event"),
    templateId: formData.get("templateId"),
    phoneNumberId: formData.get("phoneNumberId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (!session.companyId) return { error: "Tu usuario no pertenece a ninguna empresa." };

  const variableMapping: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    const match = /^var_(\d+)$/.exec(key);
    const index = match?.[1];
    if (index !== undefined && typeof value === "string" && value.length > 0) variableMapping[index] = value;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("hotmart_webhooks").insert({
    name: parsed.data.name,
    event: parsed.data.event,
    template_id: parsed.data.templateId,
    phone_number_id: parsed.data.phoneNumberId,
    variable_mapping: variableMapping,
    created_by: session.id,
    company_id: session.companyId,
  });
  if (error) return { error: error.message };

  revalidatePath("/complementos/hotmart");
  return {};
}

export async function toggleHotmartWebhookActive(webhookId: string, isActive: boolean): Promise<void> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("hotmart_webhooks").update({ is_active: isActive }).eq("id", webhookId);
  if (error) throw error;
  revalidatePath("/complementos/hotmart");
}

export async function deleteHotmartWebhook(webhookId: string): Promise<void> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("hotmart_webhooks").delete().eq("id", webhookId);
  if (error) throw error;
  revalidatePath("/complementos/hotmart");
}
