"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { normalizeWaId } from "@reto-whatsapp/core";
import type { ConsentStatus, Json } from "@reto-whatsapp/db";
import { requireRole, verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const ConsentSchema = z.object({
  contactId: z.uuid(),
  consentStatus: z.enum(["subscribed", "unsubscribed", "blocked", "pending"]),
  consentSource: z.string().optional(),
});

export interface ActionState {
  error?: string;
  success?: boolean;
}

/** Cambia el consentimiento/exclusión de un contacto (módulo 10). Queda auditado por trigger. */
export async function setConsentStatus(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await verifySession();
  const parsed = ConsentSchema.safeParse({
    contactId: formData.get("contactId"),
    consentStatus: formData.get("consentStatus"),
    consentSource: formData.get("consentSource") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const update: {
    consent_status: ConsentStatus;
    consent_source?: string;
    opted_out_at?: string | null;
    blocked_at?: string | null;
  } = {
    consent_status: parsed.data.consentStatus,
  };
  if (parsed.data.consentSource) update.consent_source = parsed.data.consentSource;
  if (parsed.data.consentStatus === "unsubscribed") update.opted_out_at = new Date().toISOString();
  if (parsed.data.consentStatus === "blocked") update.blocked_at = new Date().toISOString();

  const { error } = await supabase.from("contacts").update(update).eq("id", parsed.data.contactId);
  if (error) return { error: error.message };

  revalidatePath(`/contacts/${parsed.data.contactId}`);
  revalidatePath("/contacts");
  return { success: true };
}

const UpdateContactSchema = z.object({
  contactId: z.uuid(),
  displayName: z.string().optional(),
});

export async function updateContactName(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await verifySession();
  const parsed = UpdateContactSchema.safeParse({
    contactId: formData.get("contactId"),
    displayName: formData.get("displayName") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ display_name: parsed.data.displayName ?? null })
    .eq("id", parsed.data.contactId);
  if (error) return { error: error.message };

  revalidatePath(`/contacts/${parsed.data.contactId}`);
  return { success: true };
}

const CreateContactSchema = z.object({
  waId: z.string().min(1, { error: "El teléfono es obligatorio." }),
  displayName: z.string().optional(),
});

export async function createContact(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await verifySession();
  const parsed = CreateContactSchema.safeParse({
    waId: formData.get("waId"),
    displayName: formData.get("displayName") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const waId = normalizeWaId(parsed.data.waId);
  if (!waId) return { error: "El teléfono no parece un número válido con código de país." };

  const tagIds = formData.getAll("tagIds").map(String);

  const supabase = await createClient();
  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({ wa_id: waId, display_name: parsed.data.displayName ?? null })
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (tagIds.length > 0) {
    const { error: tagsError } = await supabase
      .from("contact_tags")
      .insert(tagIds.map((tagId) => ({ contact_id: contact.id, tag_id: tagId })));
    if (tagsError) return { error: tagsError.message };
  }

  revalidatePath("/contacts");
  return { success: true };
}

/** Etiquetas: cualquier agente puede etiquetar/desetiquetar (RLS lo permite). */
export async function addTagToContact(contactId: string, tagId: string): Promise<void> {
  await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("contact_tags").insert({ contact_id: contactId, tag_id: tagId });
  if (error && error.code !== "23505") throw error; // 23505 = ya estaba etiquetado, no es error.
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
}

export async function removeTagFromContact(contactId: string, tagId: string): Promise<void> {
  await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("contact_tags").delete().eq("contact_id", contactId).eq("tag_id", tagId);
  if (error) throw error;
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
}

const CreateTagSchema = z.object({
  name: z.string().min(1, { error: "El nombre es obligatorio." }),
  color: z.string().min(1),
});

/** Crear etiquetas está restringido a admin/supervisor (RLS de la tabla tags). */
export async function createTag(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireRole("admin", "supervisor");
  const parsed = CreateTagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "#6b7280",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.from("tags").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/contacts");
  return { success: true };
}

const CreateCustomFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, { error: "Usa solo minúsculas, números y guion bajo." }),
  label: z.string().min(1, { error: "La etiqueta es obligatoria." }),
  fieldType: z.enum(["text", "number", "date", "boolean", "select"]),
});

/** Definir campos personalizados es admin-only (RLS de custom_field_definitions). */
export async function createCustomFieldDefinition(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin");
  const parsed = CreateCustomFieldSchema.safeParse({
    key: formData.get("key"),
    label: formData.get("label"),
    fieldType: formData.get("fieldType"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.from("custom_field_definitions").insert({
    key: parsed.data.key,
    label: parsed.data.label,
    field_type: parsed.data.fieldType,
  });
  if (error) return { error: error.message };

  revalidatePath("/contacts");
  revalidatePath("/settings/custom-fields");
  return { success: true };
}

const UpdateCustomFieldValueSchema = z.object({
  contactId: z.uuid(),
  key: z.string().min(1),
  value: z.string(),
});

export async function updateContactCustomField(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  await verifySession();
  const parsed = UpdateCustomFieldValueSchema.safeParse({
    contactId: formData.get("contactId"),
    key: formData.get("key"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data: contact, error: fetchError } = await supabase
    .from("contacts")
    .select("custom_fields")
    .eq("id", parsed.data.contactId)
    .single();
  if (fetchError) return { error: fetchError.message };

  const nextCustomFields = {
    ...(contact.custom_fields as unknown as Record<string, unknown>),
    [parsed.data.key]: parsed.data.value,
  };
  const { error } = await supabase
    .from("contacts")
    .update({ custom_fields: nextCustomFields as unknown as Json })
    .eq("id", parsed.data.contactId);
  if (error) return { error: error.message };

  revalidatePath(`/contacts/${parsed.data.contactId}`);
  return { success: true };
}
