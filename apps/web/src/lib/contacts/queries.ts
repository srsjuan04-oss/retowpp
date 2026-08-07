import "server-only";
import type { ConsentStatus } from "@reto-whatsapp/db";
import { createClient } from "@/lib/supabase/server";

export interface ContactListItem {
  id: string;
  waId: string;
  displayName: string | null;
  consentStatus: ConsentStatus;
  tags: { id: string; name: string; color: string }[];
}

export interface ListContactsFilters {
  // Vienen directo de searchParams (siempre string | undefined), así que se
  // acepta explícitamente undefined en vez de solo "clave ausente".
  search?: string | undefined;
  tagId?: string | undefined;
  consentStatus?: ConsentStatus | undefined;
}

export async function listContacts(filters: ListContactsFilters = {}): Promise<ContactListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select("id, wa_id, display_name, consent_status")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.search) {
    query = query.or(`display_name.ilike.%${filters.search}%,wa_id.ilike.%${filters.search}%`);
  }
  if (filters.consentStatus) {
    query = query.eq("consent_status", filters.consentStatus);
  }

  const { data: contacts, error } = await query;
  if (error) throw error;
  if (!contacts || contacts.length === 0) return [];

  const contactIds = contacts.map((c) => c.id);
  const { data: contactTags, error: tagsError } = await supabase
    .from("contact_tags")
    .select("contact_id, tag_id")
    .in("contact_id", contactIds);
  if (tagsError) throw tagsError;

  const tagIds = [...new Set((contactTags ?? []).map((ct) => ct.tag_id))];
  const { data: tags } = tagIds.length
    ? await supabase.from("tags").select("id, name, color").in("id", tagIds)
    : { data: [] };
  const tagById = new Map((tags ?? []).map((t) => [t.id, t]));

  const tagsByContactId = new Map<string, { id: string; name: string; color: string }[]>();
  for (const ct of contactTags ?? []) {
    const tag = tagById.get(ct.tag_id);
    if (!tag) continue;
    const list = tagsByContactId.get(ct.contact_id) ?? [];
    list.push(tag);
    tagsByContactId.set(ct.contact_id, list);
  }

  let result = contacts.map((c) => ({
    id: c.id,
    waId: c.wa_id,
    displayName: c.display_name,
    consentStatus: c.consent_status,
    tags: tagsByContactId.get(c.id) ?? [],
  }));

  if (filters.tagId) {
    result = result.filter((c) => c.tags.some((t) => t.id === filters.tagId));
  }

  return result;
}

export interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  fieldType: "text" | "number" | "date" | "boolean" | "select";
  options: unknown;
}

export async function listCustomFieldDefinitions(): Promise<CustomFieldDefinition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_field_definitions")
    .select("id, key, label, field_type, options")
    .order("label");
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id,
    key: d.key,
    label: d.label,
    fieldType: d.field_type as CustomFieldDefinition["fieldType"],
    options: d.options,
  }));
}

export interface TagItem {
  id: string;
  name: string;
  color: string;
}

export async function listTags(): Promise<TagItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tags").select("id, name, color").order("name");
  if (error) throw error;
  return data ?? [];
}

export interface ContactDetail extends ContactListItem {
  consentSource: string | null;
  customFields: Record<string, unknown>;
}

export async function getContact(contactId: string): Promise<ContactDetail | null> {
  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, wa_id, display_name, consent_status, consent_source, custom_fields")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return null;

  const { data: contactTags } = await supabase.from("contact_tags").select("tag_id").eq("contact_id", contactId);
  const tagIds = (contactTags ?? []).map((ct) => ct.tag_id);
  const { data: tags } = tagIds.length
    ? await supabase.from("tags").select("id, name, color").in("id", tagIds)
    : { data: [] };

  return {
    id: contact.id,
    waId: contact.wa_id,
    displayName: contact.display_name,
    consentStatus: contact.consent_status,
    consentSource: contact.consent_source,
    customFields: contact.custom_fields as unknown as Record<string, unknown>,
    tags: tags ?? [],
  };
}
