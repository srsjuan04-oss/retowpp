import type { SupabaseClient } from "@supabase/supabase-js";
import { WhatsAppClient, decryptWabaToken } from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";

type Client = SupabaseClient<Database>;

/** Resuelve el cliente de WhatsApp Cloud API para un `phone_numbers.id` (uuid interno). */
export async function getWhatsAppClientForPhoneNumber(supabase: Client, phoneNumberRowId: string): Promise<WhatsAppClient> {
  const { data: phoneNumber, error: phoneError } = await supabase
    .from("phone_numbers")
    .select("phone_number_id, waba_account_id")
    .eq("id", phoneNumberRowId)
    .single();
  if (phoneError) throw phoneError;

  const { data: wabaAccount, error: wabaError } = await supabase
    .from("waba_accounts")
    .select("access_token_encrypted")
    .eq("id", phoneNumber.waba_account_id)
    .single();
  if (wabaError) throw wabaError;

  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("Falta configurar WABA_TOKEN_ENCRYPTION_KEY en el servidor.");

  return new WhatsAppClient({
    accessToken: decryptWabaToken(wabaAccount.access_token_encrypted, encryptionKey),
    phoneNumberId: phoneNumber.phone_number_id,
    ...(process.env.META_GRAPH_API_VERSION ? { graphApiVersion: process.env.META_GRAPH_API_VERSION } : {}),
    ...(process.env.META_APP_SECRET ? { appSecret: process.env.META_APP_SECRET } : {}),
  });
}
