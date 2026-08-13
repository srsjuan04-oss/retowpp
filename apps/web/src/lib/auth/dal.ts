import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@reto-whatsapp/db";
import { createClient } from "@/lib/supabase/server";

export type Role = UserRole;

export interface SessionUser {
  id: string;
  email: string | null;
  role: Role;
  fullName: string | null;
  companyId: string | null;
  isPlatformAdmin: boolean;
}

/**
 * Data Access Layer: punto único donde se verifica la sesión y se resuelve el rol.
 * Se usa en Server Components, Route Handlers y Server Actions (nunca solo en `proxy.ts`,
 * que únicamente hace el chequeo optimista de "¿hay sesión?").
 */
export const verifySession = cache(async (): Promise<SessionUser> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, is_active, company_id, is_platform_admin, companies(is_active)")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) redirect("/login");
  // Empresa desactivada por la plataforma (p. ej. dejó de pagar): se corta el
  // acceso igual que una cuenta inactiva, salvo para administradores de
  // plataforma (que no dependen de ninguna empresa para entrar).
  if (!profile.is_platform_admin && profile.companies && !profile.companies.is_active) redirect("/login");

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile.role as Role,
    fullName: profile.full_name as string | null,
    companyId: profile.company_id,
    isPlatformAdmin: profile.is_platform_admin,
  };
});

/** Exige uno de los roles indicados; redirige a /dashboard si el usuario no califica. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const session = await verifySession();
  if (!roles.includes(session.role)) redirect("/dashboard");
  return session;
}

/** Exige que el usuario sea administrador de plataforma (puede crear/gestionar empresas). */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const session = await verifySession();
  if (!session.isPlatformAdmin) redirect("/dashboard");
  return session;
}
