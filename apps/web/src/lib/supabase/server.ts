import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@reto-whatsapp/db";

/**
 * Cliente Supabase para Server Components/Route Handlers/Server Actions.
 * Respeta RLS: opera con la sesión del usuario autenticado, nunca con el service role.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Invocado desde un Server Component sin permiso de escritura de cookies;
            // el refresco de sesión lo garantiza igualmente `proxy.ts`.
          }
        },
      },
    },
  );
}
