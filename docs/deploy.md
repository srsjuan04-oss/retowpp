# Despliegue — Reto WhatsApp

Arquitectura de despliegue: **Next.js (`apps/web`) en Vercel** + **worker independiente (`apps/worker`) en
Railway o Fly.io** + **Redis administrado** + **Supabase** (Postgres/Auth/Realtime/Storage).

## 1. Supabase (producción)

1. Crea un proyecto Supabase de producción (separado del de desarrollo).
2. Aplica las migraciones:

   ```bash
   supabase link --project-ref <project-ref-prod>
   supabase db push
   ```

3. Guarda `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` para los pasos
   siguientes.
4. Revisa los **Advisors** de Supabase (Security/Performance) antes de ir a producción.

## 2. Redis administrado

Usa Railway Redis, Upstash o cualquier proveedor que te dé una `REDIS_URL` accesible tanto desde Vercel (el
productor de jobs) como desde donde despliegues el worker (el consumidor). Debe ser la **misma instancia** para
ambos.

## 3. `apps/web` en Vercel

1. Importa el repo en Vercel.
2. **Root Directory**: `apps/web` (Vercel detecta el monorepo y solo construye este workspace).
3. Build command / install command: los que detecta Vercel automáticamente para Next.js funcionan, ya que
   `bun install` en la raíz del repo resuelve los workspaces antes del build.
4. Variables de entorno (Project Settings → Environment Variables), igual que en `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_API_VERSION`
   - `WABA_TOKEN_ENCRYPTION_KEY` (debe ser **idéntica** a la que use el worker, o no podrá descifrar los tokens
     que la app cifró y viceversa)
   - `REDIS_URL`
5. Despliega. La URL pública de webhooks queda en `https://<tu-app>.vercel.app/api/webhooks/whatsapp`.

## 4. `apps/worker` en Railway o Fly.io

El worker es un proceso Node.js de larga duración (no serverless), por eso no va en Vercel. Usa el
`apps/worker/Dockerfile` incluido:

### Railway

1. Nuevo servicio → Deploy from repo → selecciona este repositorio.
2. **Root Directory**: `apps/worker` (o deja la raíz y Railway detectará el `Dockerfile` en `apps/worker/Dockerfile`
   si configuras el "Dockerfile Path" en la configuración del servicio).
3. Variables de entorno: las mismas que el web **excepto** `NEXT_PUBLIC_*` (el worker no las necesita), más
   `SUPABASE_SERVICE_ROLE_KEY`, `WABA_TOKEN_ENCRYPTION_KEY`, `META_GRAPH_API_VERSION`, `REDIS_URL`.
4. Railway mantiene el proceso corriendo (no es una función serverless); no necesita un healthcheck HTTP porque el
   worker no expone ningún puerto.

### Fly.io (alternativa)

```bash
cd apps/worker
fly launch --dockerfile Dockerfile --no-deploy
fly secrets set SUPABASE_SERVICE_ROLE_KEY=... WABA_TOKEN_ENCRYPTION_KEY=... REDIS_URL=... # etc.
fly deploy
```

## 5. Configurar el webhook en Meta

En el panel de Meta for Developers, apunta el **Callback URL** a
`https://<tu-dominio-de-vercel>/api/webhooks/whatsapp` con el mismo `META_WEBHOOK_VERIFY_TOKEN` configurado en
Vercel.

## 6. Checklist post-deploy

- [ ] `bun test` y `bun run typecheck` pasan en CI antes de mergear a la rama de producción.
- [ ] El webhook responde 200 al challenge de verificación de Meta (`GET` con `hub.challenge`).
- [ ] Enviar un mensaje de prueba a la línea conectada y confirmar que aparece en `/inbox` en tiempo real.
- [ ] Sincronizar plantillas (`/templates`) y confirmar que aparecen como `approved`.
- [ ] Correr una campaña de prueba con 1-2 contactos internos antes de una campaña real.
- [ ] Revisar `/audit-log` y `/stats` para confirmar que los triggers de auditoría están escribiendo.
