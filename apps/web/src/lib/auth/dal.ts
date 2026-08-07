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
    .select("role, full_name, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) redirect("/login");

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile.role as Role,
    fullName: profile.full_name as string | null,
  };
});

/** Exige uno de los roles indicados; redirige a /dashboard si el usuario no califica. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const session = await verifySession();
  if (!roles.includes(session.role)) redirect("/dashboard");
  return session;
}
