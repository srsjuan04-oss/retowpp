"use server";

import * as z from "zod";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const ForgotPasswordSchema = z.object({
  email: z.email({ error: "Ingresa un correo válido." }),
});

export interface ForgotPasswordState {
  error?: string;
  success?: boolean;
}

/**
 * Siempre responde con éxito genérico (no revela si el correo existe o no,
 * para no filtrar qué cuentas están registradas).
 */
export async function requestPasswordReset(
  _prevState: ForgotPasswordState | undefined,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = ForgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  return { success: true };
}
