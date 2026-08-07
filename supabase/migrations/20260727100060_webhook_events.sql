-- Almacenamiento crudo de webhooks de Meta ANTES de procesarlos (regla obligatoria).
-- El receptor (Route Handler) inserta con el service role; el worker marca
-- processed_at al terminar. Ningún usuario final escribe aquí directamente.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  waba_account_id uuid references public.waba_accounts (id),
  event_type text not null,
  payload jsonb not null,
  signature_valid boolean not null,
  -- Hash del body exacto recibido: evita procesar dos veces la misma entrega
  -- si Meta reintenta porque no confirmamos a tiempo.
  dedupe_key text not null unique,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  retry_count integer not null default 0
);

create index webhook_events_unprocessed_idx on public.webhook_events (received_at)
  where processed_at is null;

alter table public.webhook_events enable row level security;

-- Solo admin/supervisor pueden auditar webhooks crudos desde la app; el
-- receptor y el worker usan el service role, que no está sujeto a RLS.
create policy webhook_events_select_admin on public.webhook_events
  for select to authenticated
  using (public.is_admin_or_supervisor());
