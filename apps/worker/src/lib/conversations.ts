import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@reto-whatsapp/db";

type Client = SupabaseClient<Database>;

/** Busca la conversación de un contacto con un número dado, o la crea si no existe. */
export async function findOrCreateConversation(
  supabase: Client,
  contactId: string,
  phoneNumberRowId: string,
  companyId: string,
): Promise<string> {
  // Sin .maybeSingle(): si ya había 2+ filas duplicadas, maybeSingle devolvía error
  // (PGRST116) con data null, y se creaba OTRA conversación en cada llamada — así se
  // acumularon ~50 mil conversaciones vacías en nov-2026. Se toma la más antigua.
  const { data: existingRows, error: findError } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("phone_number_id", phoneNumberRowId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (findError) throw findError;
  const existing = existingRows?.[0];
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ contact_id: contactId, phone_number_id: phoneNumberRowId, company_id: companyId })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}
