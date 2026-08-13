"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { resolveCampaignVariables } from "@reto-whatsapp/core";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { enqueueCampaignDispatch } from "@/lib/queues/campaign-dispatch";
import { previewAudience, type AudienceFilter } from "@/lib/campaigns/queries";

export interface ActionState {
  error?: string;
  success?: boolean;
}

const CreateCampaignSchema = z.object({
  name: z.string().min(1, { error: "El nombre es obligatorio." }),
  templateId: z.uuid(),
  phoneNumberId: z.uuid(),
});

/** Crea la campaña en borrador con su filtro de audiencia y mapeo de variables. */
export async function createCampaign(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const session = await requireRole("admin", "supervisor");
  if (!session.companyId) return { error: "Tu usuario no pertenece a ninguna empresa." };

  const parsed = CreateCampaignSchema.safeParse({
    name: formData.get("name"),
    templateId: formData.get("templateId"),
    phoneNumberId: formData.get("phoneNumberId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const includeTagIds = formData.getAll("includeTagIds").map(String);
  const excludeTagIds = formData.getAll("excludeTagIds").map(String);

  const variableMapping: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    const match = /^var_(\d+)$/.exec(key);
    const index = match?.[1];
    if (index !== undefined && typeof value === "string" && value.length > 0) variableMapping[index] = value;
  }

  const supabase = await createClient();
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      name: parsed.data.name,
      template_id: parsed.data.templateId,
      phone_number_id: parsed.data.phoneNumberId,
      variable_mapping: variableMapping,
      audience_filter: { includeTagIds, excludeTagIds } satisfies AudienceFilter,
      company_id: session.companyId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaign.id}`);
}

export interface AudiencePreview {
  count: number;
  sample: { displayName: string | null; waId: string }[];
}

/** Vista previa de destinatarios (módulo 16), antes de crear/bloquear la campaña. */
export async function previewAudienceCount(includeTagIds: string[], excludeTagIds: string[]): Promise<AudiencePreview> {
  await requireRole("admin", "supervisor");
  const recipients = await previewAudience({ includeTagIds, excludeTagIds });
  return {
    count: recipients.length,
    sample: recipients.slice(0, 10).map((r) => ({ displayName: r.displayName, waId: r.waId })),
  };
}

/** Materializa el snapshot inmutable de destinatarios ANTES de iniciar el envío. */
export async function lockRecipients(campaignId: string): Promise<ActionState> {
  await requireRole("admin", "supervisor");
  const supabase = await createClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, status, audience_filter, variable_mapping")
    .eq("id", campaignId)
    .single();
  if (error || !campaign) return { error: "Campaña no encontrada." };
  if (campaign.status !== "draft") return { error: "La campaña ya no está en borrador." };

  const rawFilter = campaign.audience_filter as Partial<AudienceFilter>;
  const filter: AudienceFilter = {
    includeTagIds: rawFilter.includeTagIds ?? [],
    excludeTagIds: rawFilter.excludeTagIds ?? [],
  };
  const recipients = await previewAudience(filter);
  if (recipients.length === 0) return { error: "No hay destinatarios que cumplan el filtro y estén suscritos." };

  const rows = recipients.map((contact) => ({
    campaign_id: campaignId,
    contact_id: contact.id,
    phone_number_snapshot: contact.waId,
    variables: resolveCampaignVariables(campaign.variable_mapping as unknown as Record<string, string>, {
      displayName: contact.displayName,
      waId: contact.waId,
      customFields: contact.customFields,
    }),
  }));

  const { error: insertError } = await supabase.from("campaign_recipients").insert(rows);
  if (insertError) return { error: insertError.message };

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({ status: "recipients_locked" })
    .eq("id", campaignId);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/campaigns/${campaignId}`);
  return { success: true };
}

/** La request solo cambia el status y encola el job orquestador; nunca envía nada directamente. */
export async function startCampaign(campaignId: string): Promise<ActionState> {
  await requireRole("admin", "supervisor");
  const supabase = await createClient();

  const { data: campaign, error } = await supabase.from("campaigns").select("status").eq("id", campaignId).single();
  if (error || !campaign) return { error: "Campaña no encontrada." };
  if (campaign.status !== "recipients_locked") return { error: "Primero bloquea los destinatarios." };

  const { error: updateError } = await supabase.from("campaigns").update({ status: "queued" }).eq("id", campaignId);
  if (updateError) return { error: updateError.message };

  await enqueueCampaignDispatch(campaignId);

  revalidatePath(`/campaigns/${campaignId}`);
  return { success: true };
}
