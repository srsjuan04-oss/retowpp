"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";

const CreateCompanySchema = z.object({
  companyName: z.string().min(1, { error: "El nombre de la empresa es obligatorio." }),
  adminEmail: z.email({ error: "Ingresa un correo válido." }),
  adminFullName: z.string().optional(),
});

export interface CreateCompanyState {
  error?: string;
  success?: { companyName: string; adminEmail: string; tempPassword: string };
}

function generateTempPassword(): string {
  // 16 caracteres alfanuméricos, suficiente para una contraseña temporal de
  // primer acceso — el usuario nuevo la cambia desde su propia cuenta.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Crea una empresa nueva y su primer usuario (admin de esa empresa). No hay
 * signup público (decisión del producto): esto es lo único que da de alta
 * clientes nuevos, y solo un administrador de plataforma puede hacerlo.
 * La contraseña temporal se muestra una sola vez en la respuesta — no hay
 * envío de correo configurado, así que se la pasa al cliente el propio dueño
 * de la plataforma.
 */
export async function createCompany(_prev: CreateCompanyState | undefined, formData: FormData): Promise<CreateCompanyState> {
  await requirePlatformAdmin();

  const parsed = CreateCompanySchema.safeParse({
    companyName: formData.get("companyName"),
    adminEmail: formData.get("adminEmail"),
    adminFullName: formData.get("adminFullName") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = createAdminClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({ name: parsed.data.companyName })
    .select("id")
    .single();
  if (companyError) return { error: `No se pudo crear la empresa: ${companyError.message}` };

  const tempPassword = generateTempPassword();
  const { error: userError } = await supabase.auth.admin.createUser({
    email: parsed.data.adminEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.adminFullName ?? null,
      company_id: company.id,
      role: "admin",
    },
  });
  if (userError) {
    // La empresa ya quedó creada; se informa el error puntual del usuario para
    // que se pueda reintentar solo esa parte (no hay transacción entre
    // auth.users, que vive en otro esquema, y esta tabla).
    return { error: `La empresa se creó, pero no se pudo crear el usuario: ${userError.message}` };
  }

  revalidatePath("/plataforma/empresas");
  return {
    success: { companyName: parsed.data.companyName, adminEmail: parsed.data.adminEmail, tempPassword },
  };
}

export async function setCompanyActive(companyId: string, isActive: boolean): Promise<void> {
  await requirePlatformAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("companies").update({ is_active: isActive }).eq("id", companyId);
  if (error) throw error;
  revalidatePath("/plataforma/empresas");
}
