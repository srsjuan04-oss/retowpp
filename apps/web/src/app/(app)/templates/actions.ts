"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import {
  buildTemplateComponents,
  decryptWabaToken,
  TEMPLATE_NAME_RE,
  WhatsAppApiError,
  WhatsAppClient,
  type TemplateButtonDraft,
} from "@reto-whatsapp/core";
import type { Json } from "@reto-whatsapp/db";
import { requireRole } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueTemplateSync } from "@/lib/queues/template-sync";

export async function triggerTemplateSync(): Promise<void> {
  await requireRole("admin", "supervisor");
  await enqueueTemplateSync();
}

const CreateTemplateSchema = z.object({
  wabaAccountId: z.uuid(),
  name: z.string().regex(TEMPLATE_NAME_RE, { error: "El nombre solo puede tener minúsculas, números y guion bajo." }),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  language: z.string().min(2, { error: "El código de idioma es obligatorio (ej. es_MX)." }),
  headerText: z.string().optional(),
  bodyText: z.string().min(1, { error: "El cuerpo de la plantilla es obligatorio." }),
  footerText: z.string().optional(),
});

export interface CreateTemplateState {
  error?: string;
  success?: boolean;
}

function collectIndexed(formData: FormData, prefix: string): Map<number, string> {
  const values = new Map<number, string>();
  const re = new RegExp(`^${prefix}_(\\d+)$`);
  for (const [key, value] of formData.entries()) {
    const match = re.exec(key);
    if (match?.[1] !== undefined && typeof value === "string") values.set(Number(match[1]), value);
  }
  return values;
}

function collectButtons(formData: FormData): TemplateButtonDraft[] {
  const types = collectIndexed(formData, "button_type");
  const texts = collectIndexed(formData, "button_text");
  const urls = collectIndexed(formData, "button_url");
  return [...types.keys()]
    .sort((a, b) => a - b)
    .map((idx) => {
      const url = urls.get(idx);
      const type: TemplateButtonDraft["type"] = types.get(idx) === "URL" ? "URL" : "QUICK_REPLY";
      return url !== undefined ? { type, text: texts.get(idx) ?? "", url } : { type, text: texts.get(idx) ?? "" };
    });
}

/**
 * Crea la plantilla directamente en Meta (queda en estado PENDING hasta que la revisen)
 * y la refleja de inmediato en la tabla local para no depender de la próxima sincronización.
 */
export async function createTemplate(
  _prevState: CreateTemplateState | undefined,
  formData: FormData,
): Promise<CreateTemplateState> {
  const session = await requireRole("admin");
  if (!session.companyId) return { error: "Tu usuario no pertenece a ninguna empresa." };

  const parsed = CreateTemplateSchema.safeParse({
    wabaAccountId: formData.get("wabaAccountId"),
    name: formData.get("name"),
    category: formData.get("category"),
    language: formData.get("language"),
    headerText: formData.get("headerText") || undefined,
    bodyText: formData.get("bodyText"),
    footerText: formData.get("footerText") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const headerIndexed = collectIndexed(formData, "header_example");
  const bodyIndexed = collectIndexed(formData, "body_example");
  const maxHeaderIndex = Math.max(0, ...headerIndexed.keys());
  const maxBodyIndex = Math.max(0, ...bodyIndexed.keys());

  const { components, error: buildError } = buildTemplateComponents({
    ...(parsed.data.headerText ? { headerText: parsed.data.headerText } : {}),
    headerExamples: Array.from({ length: maxHeaderIndex }, (_, i) => headerIndexed.get(i + 1) ?? ""),
    bodyText: parsed.data.bodyText,
    bodyExamples: Array.from({ length: maxBodyIndex }, (_, i) => bodyIndexed.get(i + 1) ?? ""),
    ...(parsed.data.footerText ? { footerText: parsed.data.footerText } : {}),
    buttons: collectButtons(formData),
  });
  if (buildError) return { error: buildError };

  const supabase = createAdminClient();

  // El cliente admin bypassa RLS: hay que verificar a mano que la WABA elegida
  // sea de la empresa del usuario (si no, cualquiera podría crear una plantilla
  // en la WABA de otra empresa pasando su id a mano en el form).
  const { data: wabaAccount, error: wabaError } = await supabase
    .from("waba_accounts")
    .select("waba_id, company_id, access_token_encrypted")
    .eq("id", parsed.data.wabaAccountId)
    .maybeSingle();
  if (wabaError) return { error: wabaError.message };
  if (!wabaAccount || wabaAccount.company_id !== session.companyId) {
    return { error: "Esa WABA no pertenece a tu empresa." };
  }

  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) return { error: "Falta configurar WABA_TOKEN_ENCRYPTION_KEY en el servidor." };

  const client = new WhatsAppClient({
    accessToken: decryptWabaToken(wabaAccount.access_token_encrypted, encryptionKey),
    ...(process.env.META_GRAPH_API_VERSION ? { graphApiVersion: process.env.META_GRAPH_API_VERSION } : {}),
    ...(process.env.META_APP_SECRET ? { appSecret: process.env.META_APP_SECRET } : {}),
  });

  try {
    const response = await client.createTemplate(wabaAccount.waba_id, {
      name: parsed.data.name,
      language: parsed.data.language,
      category: parsed.data.category,
      components,
    });

    const { error: insertError } = await supabase.from("templates").upsert(
      {
        waba_account_id: parsed.data.wabaAccountId,
        company_id: session.companyId,
        meta_template_id: response.id,
        name: parsed.data.name,
        language: parsed.data.language,
        category: parsed.data.category,
        status: response.status.toLowerCase() as "pending" | "approved" | "rejected" | "paused" | "disabled",
        components: components as unknown as Json,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "waba_account_id,name,language" },
    );
    if (insertError) return { error: `Meta creó la plantilla pero no se pudo reflejar localmente: ${insertError.message}` };
  } catch (err) {
    if (err instanceof WhatsAppApiError) return { error: `Meta rechazó la plantilla: ${err.message}` };
    return { error: err instanceof Error ? err.message : "Error creando la plantilla." };
  }

  revalidatePath("/templates");
  return { success: true };
}
