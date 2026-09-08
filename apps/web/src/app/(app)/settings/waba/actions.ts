"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { WhatsAppClient, encryptWabaToken, exchangeEmbeddedSignupCode } from "@reto-whatsapp/core";
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

export interface CompleteEmbeddedSignupState {
  error?: string;
  success?: boolean;
}

/**
 * Termina el flujo de Embedded Signup (módulo 1/2, alternativa a conectar a mano): recibe el
 * código que devolvió el SDK de Facebook Login for Business y el waba_id/phone_number_id que
 * llegaron por el evento WA_EMBEDDED_SIGNUP, y hace el resto server-side — nada de esto puede
 * correr en el navegador porque necesita el App Secret.
 */
export async function completeEmbeddedSignup(input: {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}): Promise<CompleteEmbeddedSignupState> {
  const session = await requireRole("admin");
  if (!session.companyId) return { error: "Tu usuario no pertenece a ninguna empresa." };

  // El App ID no es secreto (viaja en el bundle del cliente para FB.init), así que se
  // reutiliza la misma variable pública en vez de pedir un META_APP_ID duplicado.
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (!appId || !appSecret) return { error: "Falta configurar NEXT_PUBLIC_META_APP_ID/META_APP_SECRET en el servidor." };
  if (!encryptionKey) return { error: "Falta configurar WABA_TOKEN_ENCRYPTION_KEY en el servidor." };

  const graphApiVersion = process.env.META_GRAPH_API_VERSION;

  try {
    const accessToken = await exchangeEmbeddedSignupCode({
      code: input.code,
      appId,
      appSecret,
      ...(graphApiVersion ? { graphApiVersion } : {}),
    });

    const client = new WhatsAppClient({ accessToken, appSecret, ...(graphApiVersion ? { graphApiVersion } : {}) });

    const [businessName, phoneInfo] = await Promise.all([
      client.getWabaBusinessName(input.wabaId),
      client.getPhoneNumberDisplayInfo(input.phoneNumberId),
    ]);

    // PIN de verificación en dos pasos: el número llega sin ninguno configurado, y Meta exige
    // mandar uno (existente o nuevo) para registrarlo. Se genera y se guarda cifrado.
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await client.registerPhoneNumber(input.phoneNumberId, pin);
    await client.subscribeAppToWaba(input.wabaId);

    const supabase = createAdminClient();
    const encryptedToken = encryptWabaToken(accessToken, encryptionKey);

    const { data: existingWaba, error: existingWabaError } = await supabase
      .from("waba_accounts")
      .select("id, company_id")
      .eq("waba_id", input.wabaId)
      .maybeSingle();
    if (existingWabaError) return { error: existingWabaError.message };
    if (existingWaba && existingWaba.company_id !== session.companyId) {
      return { error: "Esa cuenta de WhatsApp Business ya está conectada a otra empresa." };
    }

    let wabaAccountId = existingWaba?.id;
    if (existingWaba) {
      const { error: updateError } = await supabase
        .from("waba_accounts")
        .update({ business_name: businessName ?? "WhatsApp Business", access_token_encrypted: encryptedToken })
        .eq("id", existingWaba.id);
      if (updateError) return { error: updateError.message };
    } else {
      const { data: insertedWaba, error: insertError } = await supabase
        .from("waba_accounts")
        .insert({
          waba_id: input.wabaId,
          business_name: businessName ?? "WhatsApp Business",
          access_token_encrypted: encryptedToken,
          app_secret_ref: "META_APP_SECRET",
          company_id: session.companyId,
        })
        .select("id")
        .single();
      if (insertError) return { error: insertError.message };
      wabaAccountId = insertedWaba.id;
    }
    if (!wabaAccountId) return { error: "No se pudo determinar la WABA conectada." };

    const encryptedPin = encryptWabaToken(pin, encryptionKey);
    const { data: existingPhone, error: existingPhoneError } = await supabase
      .from("phone_numbers")
      .select("id, company_id")
      .eq("phone_number_id", input.phoneNumberId)
      .maybeSingle();
    if (existingPhoneError) return { error: existingPhoneError.message };
    if (existingPhone && existingPhone.company_id !== session.companyId) {
      return { error: "Ese número ya está conectado a otra empresa." };
    }

    if (existingPhone) {
      const { error: updatePhoneError } = await supabase
        .from("phone_numbers")
        .update({
          waba_account_id: wabaAccountId,
          display_phone_number: phoneInfo.displayPhoneNumber,
          label: phoneInfo.verifiedName,
          two_step_pin_encrypted: encryptedPin,
        })
        .eq("id", existingPhone.id);
      if (updatePhoneError) return { error: updatePhoneError.message };
    } else {
      const { error: insertPhoneError } = await supabase.from("phone_numbers").insert({
        waba_account_id: wabaAccountId,
        phone_number_id: input.phoneNumberId,
        display_phone_number: phoneInfo.displayPhoneNumber,
        label: phoneInfo.verifiedName,
        two_step_pin_encrypted: encryptedPin,
        company_id: session.companyId,
      });
      if (insertPhoneError) return { error: insertPhoneError.message };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error completando el registro insertado." };
  }

  revalidatePath("/settings/waba");
  return { success: true };
}
