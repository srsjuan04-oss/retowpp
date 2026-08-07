# Configuración local — Reto WhatsApp

## Prerrequisitos

- [Bun](https://bun.sh) 1.3+ (runtime y gestor de paquetes del monorepo; no se usa Node/npm/pnpm directamente).
- Redis (local vía Docker/Homebrew, o un servicio administrado como Upstash) para BullMQ.
- Una cuenta de [Supabase](https://supabase.com) (Postgres + Auth + Realtime + Storage).
- Una cuenta de [Meta for Developers](https://developers.facebook.com) con acceso a WhatsApp Cloud API y una WABA ya aprobada.

## 1. Instalar dependencias

```bash
bun install
```

Esto enlaza automáticamente `packages/core` y `packages/db` dentro de `apps/web` y `apps/worker` (protocolo `workspace:*`).

## 2. Crear el proyecto Supabase

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com).
2. Instala la Supabase CLI y aplica las migraciones versionadas en `supabase/migrations/`:

   ```bash
   supabase link --project-ref <tu-project-ref>
   supabase db push
   ```

3. Copia `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` desde
   **Project Settings → API**.

## 3. Variables de entorno

Copia `.env.example` a `.env` en la raíz (Bun carga `.env` automáticamente) y completa:

| Variable | Dónde se usa | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web y worker | Del proyecto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | web (Route Handlers) y worker | **Nunca** exponer al navegador ni prefijar con `NEXT_PUBLIC_`. |
| `META_WHATSAPP_ACCESS_TOKEN` | solo para seed/desarrollo | En producción el token vive cifrado en `waba_accounts` (ver paso 5). |
| `META_APP_SECRET` | web (verificación de firma de webhooks) | Del panel de tu app de Meta. |
| `META_WEBHOOK_VERIFY_TOKEN` | web (challenge GET del webhook) | Cadena arbitraria que tú defines y repites en el panel de Meta. |
| `META_GRAPH_API_VERSION` | web y worker | Por ejemplo `v21.0`. |
| `WABA_TOKEN_ENCRYPTION_KEY` | web y worker | Genera una con `openssl rand -base64 32`. Cifra el access token antes de guardarlo. |
| `REDIS_URL` | web (encolar) y worker (procesar) | `redis://localhost:6379` en local. |

## 4. Redis local

```bash
docker run -p 6379:6379 redis:7
```

## 5. Levantar la app y el worker

```bash
bun run dev:web     # http://localhost:3000
bun run dev:worker  # procesa webhooks, campañas, plantillas, importaciones
```

## 6. Crear el primer usuario admin

Por diseño, todo usuario nuevo se crea con rol `agent` (mínimo privilegio). Para crear el primer admin:

1. Regístrate/crea el usuario desde `/login` (o desde el dashboard de Supabase Auth).
2. En el SQL Editor de Supabase (usa el rol `postgres`, que no pasa por la validación de "solo un admin cambia roles"), ejecuta:

   ```sql
   update public.profiles set role = 'admin' where id = '<uuid-del-usuario>';
   ```

Desde ese momento, ese usuario puede promover a otros desde la app.

## 7. Conectar la WABA y el Phone Number ID

Como admin, entra a **Conexión WABA** (`/settings/waba`) y registra:

1. El **WABA ID** y el **access token** de un System User con permisos `whatsapp_business_messaging` y
   `whatsapp_business_management`. El token se cifra antes de guardarse (`WABA_TOKEN_ENCRYPTION_KEY`).
2. El **Phone Number ID** de cada línea que vayas a usar.

## 8. Configurar el webhook en Meta

En **WhatsApp → Configuration** de tu app de Meta:

- **Callback URL**: `https://<tu-dominio>/api/webhooks/whatsapp` (en local, usa un túnel como `ngrok` para exponer
  `localhost:3000`).
- **Verify token**: el mismo valor de `META_WEBHOOK_VERIFY_TOKEN`.
- Suscríbete al menos a los campos `messages`.

## 9. Sincronizar plantillas

En `/templates` (admin/supervisor), botón **Sincronizar ahora**. También corre solo cada 6 horas automáticamente.

## Pruebas

```bash
bun test          # unit tests de packages/core (firma de webhooks, idempotencia, ventana 24h, consentimiento, plantillas)
bun run typecheck # TypeScript estricto en todo el monorepo
bun run lint      # ESLint (apps/web)
```
