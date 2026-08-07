import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@reto-whatsapp/db";

/** Cliente Supabase de navegador, usado solo para suscripciones Realtime autorizadas por RLS. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
