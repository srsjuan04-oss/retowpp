import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@reto-whatsapp/db";

/**
 * Cliente con service role: omite RLS por completo. Uso restringido a rutas donde
 * no existe sesión de usuario por diseño (receptor de webhooks de Meta) o a tareas
 * de sistema ejecutadas por el worker. Nunca exponer este cliente ni el service role
 * key a código que responda directamente a input arbitrario de un usuario final.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
