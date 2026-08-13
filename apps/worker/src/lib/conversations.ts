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
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("phone_number_id", phoneNumberRowId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ contact_id: contactId, phone_number_id: phoneNumberRowId, company_id: companyId })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}
