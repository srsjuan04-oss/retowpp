"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { encryptWabaToken } from "@reto-whatsapp/core";
import { requireRole } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";

const ConnectWabaSchema = z.object({
  wabaId: z.string().min(1, { error: "El WABA ID es obligatorio." }),
  businessName: z.string().min(1, { error: "El nombre del negocio es obligatorio." }),
  accessToken: z.string().min(10, { error: "El access token no parece válido." }),
});

export interface ConnectWabaState {
  error?: string;
  success?: boolean;
}

/**
 * Conecta una WABA existente (módulo 1). El token se cifra antes de guardarse
 * y la escritura va siempre por el service role: ni RLS ni el rol
 * `authenticated` pueden usarse como sustituto de esta validación de admin.
 */
export async function connectWaba(_prevState: ConnectWabaState | undefined, formData: FormData): Promise<ConnectWabaState> {
  const session = await requireRole("admin");
  if (!session.companyId) return { error: "Tu usuario no pertenece a ninguna empresa." };

  const parsed = ConnectWabaSchema.safeParse({
    wabaId: formData.get("wabaId"),
    businessName: formData.get("businessName"),
    accessToken: formData.get("accessToken"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) {
    return { error: "Falta configurar WABA_TOKEN_ENCRYPTION_KEY en el servidor." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("waba_accounts").insert({
    waba_id: parsed.data.wabaId,
    business_name: parsed.data.businessName,
    access_token_encrypted: encryptWabaToken(parsed.data.accessToken, encryptionKey),
    app_secret_ref: "META_APP_SECRET", // Referencia informativa: el secreto real vive solo en env vars.
    company_id: session.companyId,
  });

  if (error) {
    return { error: `No se pudo conectar la WABA: ${error.message}` };
  }

  revalidatePath("/settings/waba");
  return { success: true };
}

const AddPhoneNumberSchema = z.object({
  wabaAccountId: z.string().min(1),
  phoneNumberId: z.string().min(1, { error: "El Phone Number ID es obligatorio." }),
  displayPhoneNumber: z.string().min(1, { error: "El número visible es obligatorio." }),
  label: z.string().optional(),
});

export interface AddPhoneNumberState {
  error?: string;
  success?: boolean;
}

/** Registra un Phone Number ID bajo una WABA ya conectada (módulo 2). */
export async function addPhoneNumber(
  _prevState: AddPhoneNumberState | undefined,
  formData: FormData,
): Promise<AddPhoneNumberState> {
  const session = await requireRole("admin");
  if (!session.companyId) return { error: "Tu usuario no pertenece a ninguna empresa." };

  const parsed = AddPhoneNumberSchema.safeParse({
    wabaAccountId: formData.get("wabaAccountId"),
    phoneNumberId: formData.get("phoneNumberId"),
    displayPhoneNumber: formData.get("displayPhoneNumber"),
    label: formData.get("label") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = createAdminClient();

  // El cliente admin bypassa RLS: hay que verificar a mano que la WABA elegida
  // sea de la empresa del usuario (si no, cualquiera podría colgar un número
  // de otra empresa pasando su id a mano en el form).
  const { data: wabaAccount, error: wabaError } = await supabase
    .from("waba_accounts")
    .select("company_id")
    .eq("id", parsed.data.wabaAccountId)
    .maybeSingle();
  if (wabaError) return { error: wabaError.message };
  if (!wabaAccount || wabaAccount.company_id !== session.companyId) {
    return { error: "Esa WABA no pertenece a tu empresa." };
  }

  const { error } = await supabase.from("phone_numbers").insert({
    waba_account_id: parsed.data.wabaAccountId,
    phone_number_id: parsed.data.phoneNumberId,
    display_phone_number: parsed.data.displayPhoneNumber,
    label: parsed.data.label ?? null,
    company_id: session.companyId,
  });

  if (error) {
    return { error: `No se pudo agregar el número: ${error.message}` };
  }

  revalidatePath("/settings/waba");
  return { success: true };
}
