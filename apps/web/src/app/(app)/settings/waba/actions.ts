"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { WhatsAppClient, decryptWabaToken, encryptWabaToken, exchangeEmbeddedSignupCode } from "@reto-whatsapp/core";
import { requireRole } from "@/lib/auth/dal";
import { friendlyDbError } from "@/lib/db-error";
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

export interface SetPhoneNumberAiAgentEnabledState {
  error?: string;
  success?: boolean;
}

/**
 * Prende/apaga el Agente de IA solo para este número (además del interruptor general de la
 * empresa en /settings/ai, que sigue aplicando a todos). Útil para pausar el bot en un número
 * puntual —por ejemplo uno personal de prueba— sin afectar el resto ni dejar de recibir/enviar
 * mensajes por ese número.
 */
export async function setPhoneNumberAiAgentEnabled(
  phoneNumberId: string,
  enabled: boolean,
): Promise<SetPhoneNumberAiAgentEnabledState> {
  const session = await requireRole("admin");
  if (!session.companyId) return { error: "Tu usuario no pertenece a ninguna empresa." };

  const supabase = createAdminClient();
  const { data: phoneNumber, error: phoneError } = await supabase
    .from("phone_numbers")
    .select("company_id")
    .eq("id", phoneNumberId)
    .maybeSingle();
  if (phoneError) return { error: phoneError.message };
  if (!phoneNumber || phoneNumber.company_id !== session.companyId) {
    return { error: "Ese número no pertenece a tu empresa." };
  }

  const { error } = await supabase.from("phone_numbers").update({ ai_agent_enabled: enabled }).eq("id", phoneNumberId);
  if (error) return { error: friendlyDbError(error) };

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
  /** Ausente cuando viene del evento FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING (migración de la
   * app de WhatsApp Business): Meta no lo manda porque el número ya está registrado; se resuelve
   * abajo listando los números de la WABA, y se omite el registro/PIN. */
  phoneNumberId?: string;
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

    // Migración de la app de WhatsApp Business (evento FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING):
    // Meta no manda phone_number_id porque el número ya está registrado — se resuelve listando
    // los números de la WABA. Asume un solo número, el caso típico de esta migración.
    let phoneNumberId = input.phoneNumberId;
    const isBusinessAppMigration = !phoneNumberId;
    if (!phoneNumberId) {
      const [firstPhoneNumber] = await client.listPhoneNumbers(input.wabaId);
      if (!firstPhoneNumber) {
        return { error: "No se encontró ningún número de teléfono en esa cuenta de WhatsApp Business." };
      }
      phoneNumberId = firstPhoneNumber.id;
    }

    const [businessName, phoneInfo] = await Promise.all([
      client.getWabaBusinessName(input.wabaId),
      client.getPhoneNumberDisplayInfo(phoneNumberId),
    ]);

    const supabase = createAdminClient();
    const encryptedToken = encryptWabaToken(accessToken, encryptionKey);

    // PIN de verificación en dos pasos: si el número ya se había registrado antes (reconectar,
    // reintentar tras un error), Meta ya le tiene un PIN asignado y exige mandar ESE mismo, no
    // uno nuevo — mandar otro distinto responde 133005 "Two step verification PIN Mismatch".
    // Solo se genera uno nuevo la primera vez que vemos este phone_number_id. En una migración
    // de la app de WhatsApp Business, Meta pide explícitamente omitir este paso por completo:
    // el número ya está registrado, volver a registrarlo no aplica.
    let pin: string | null = null;
    if (!isBusinessAppMigration) {
      const { data: phoneWithPin } = await supabase
        .from("phone_numbers")
        .select("two_step_pin_encrypted")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      pin = phoneWithPin?.two_step_pin_encrypted
        ? decryptWabaToken(phoneWithPin.two_step_pin_encrypted, encryptionKey)
        : randomInt(0, 1_000_000).toString().padStart(6, "0");
      await client.registerPhoneNumber(phoneNumberId, pin);
    }
    await client.subscribeAppToWaba(input.wabaId);

    // Best-effort: si el número venía de la app de WhatsApp Business (migración), esto dispara
    // el reenvío del historial (180 días) y los contactos por webhook (history/smb_app_state_sync,
    // procesados en el worker). En un número nuevo sin la app, Meta responde error — se ignora
    // sin romper el resto del alta, pero SÍ se loguea: sin esto, un fallo real (permisos, formato
    // de phone_number_id, etc.) queda invisible y parece que "no llegó el historial" sin pista.
    const [historySyncResult, contactsSyncResult] = await Promise.allSettled([
      client.requestSmbAppDataSync(phoneNumberId, "history"),
      client.requestSmbAppDataSync(phoneNumberId, "smb_app_state_sync"),
    ]);
    if (historySyncResult.status === "rejected") {
      console.error("[completeEmbeddedSignup] requestSmbAppDataSync(history) falló:", historySyncResult.reason);
    }
    if (contactsSyncResult.status === "rejected") {
      console.error(
        "[completeEmbeddedSignup] requestSmbAppDataSync(smb_app_state_sync) falló:",
        contactsSyncResult.reason,
      );
    }

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

    // Sin PIN (migración de la app de WhatsApp Business): no se toca two_step_pin_encrypted al
    // actualizar, y se guarda null al insertar — no hay nada que cifrar todavía.
    const encryptedPin = pin ? encryptWabaToken(pin, encryptionKey) : null;
    const { data: existingPhone, error: existingPhoneError } = await supabase
      .from("phone_numbers")
      .select("id, company_id")
      .eq("phone_number_id", phoneNumberId)
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
          ...(encryptedPin ? { two_step_pin_encrypted: encryptedPin } : {}),
        })
        .eq("id", existingPhone.id);
      if (updatePhoneError) return { error: updatePhoneError.message };
    } else {
      const { error: insertPhoneError } = await supabase.from("phone_numbers").insert({
        waba_account_id: wabaAccountId,
        phone_number_id: phoneNumberId,
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
