-- Módulo de complementos: dispara una plantilla de WhatsApp cuando llega un
-- evento de Hotmart (compra aprobada/cancelada/carrito abandonado). Cada fila
-- de hotmart_webhooks es una "receta" evento -> plantilla, con una URL propia
-- (segmento de la URL = id) que se pega en el panel de Hotmart.

create type public.hotmart_event as enum (
  'PURCHASE_APPROVED',
  'PURCHASE_CANCELED',
  'PURCHASE_OUT_OF_SHOPPING_CART'
);

create table public.hotmart_webhooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event public.hotmart_event not null,
  template_id uuid not null references public.templates (id),
  phone_number_id uuid not null references public.phone_numbers (id),
  -- Mapeo de variables de la plantilla: mismo patrón que campaigns.variable_mapping,
  -- pero con tokens {{hotmart.campo}} en vez de {{contact.campo}} (ver
  -- packages/core/src/domain/hotmart-variables.ts).
  variable_mapping jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger hotmart_webhooks_set_updated_at
  before update on public.hotmart_webhooks
  for each row execute function public.set_updated_at();

alter table public.hotmart_webhooks enable row level security;

create policy hotmart_webhooks_select on public.hotmart_webhooks
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- Configurar de dónde salen mensajes automáticos es tan sensible como
-- conectar una WABA: solo admin.
create policy hotmart_webhooks_write_admin on public.hotmart_webhooks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Mismo patrón que webhook_events: guarda el payload crudo ANTES de procesar,
-- el receptor (Route Handler) inserta con service role, el worker marca
-- processed_at al terminar.
create table public.hotmart_webhook_events (
  id uuid primary key default gen_random_uuid(),
  hotmart_webhook_id uuid references public.hotmart_webhooks (id) on delete set null,
  event text not null,
  payload jsonb not null,
  message_id uuid references public.messages (id),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index hotmart_webhook_events_unprocessed_idx on public.hotmart_webhook_events (received_at)
  where processed_at is null;
create index hotmart_webhook_events_webhook_idx on public.hotmart_webhook_events (hotmart_webhook_id, received_at desc);

alter table public.hotmart_webhook_events enable row level security;

create policy hotmart_webhook_events_select_admin on public.hotmart_webhook_events
  for select to authenticated
  using (public.is_admin_or_supervisor());
