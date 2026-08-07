import { createClient } from "@supabase/supabase-js";
import type { Database } from "@reto-whatsapp/db";

/** El worker siempre opera con el service role: no hay sesión de usuario detrás de un job de cola. */
export function createWorkerSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
