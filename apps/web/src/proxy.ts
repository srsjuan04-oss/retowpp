import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_ROUTES = ["/login", "/forgot-password", "/auth/confirm"];

/**
 * En Next.js 16 el archivo `middleware.ts` fue renombrado a `proxy.ts` (la función
 * exportada pasó de `middleware` a `proxy`). Este proxy solo hace el chequeo optimista
 * (redirigir si no hay sesión) y refresca las cookies de sesión de Supabase; la
 * autorización real por rol vive en el DAL (`src/lib/auth/dal.ts`) y en RLS.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicRoute = PUBLIC_ROUTES.some((route) => request.nextUrl.pathname.startsWith(route));

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Excluye rutas de API (incluye /api/webhooks/whatsapp, que Meta llama sin cookies
    // de sesión y que hace su propia verificación de firma), estáticos e imágenes.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
