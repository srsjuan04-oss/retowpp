-- Recordatorios de citas disparados desde salon-pro (CRM): mismo patrón que
-- hotmart_webhooks/hotmart_webhook_events (evento -> plantilla con variables ->
-- envío por Meta Cloud API), pero el payload ya llega limpio (no hace falta
-- "extraer" nada de un formato externo como con Hotmart), y la seguridad es la
-- misma que Hotmart: el id (uuid, no adivinable) de esta fila es la URL que se
-- pega en salon-pro, no hace falta un token/secret aparte.

create table public.appointment_reminder_webhooks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  template_id uuid references public.templates (id) on delete set null,
  phone_number_id uuid not null references public.phone_numbers (id) on delete cascade,
  -- Igual que hotmart_webhooks.variable_mapping: índice de plantilla ("1","2",...) ->
  -- texto con referencias {{appt.campo}}, resuelto contra el payload de cada evento.
  variable_mapping jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointment_reminder_events (
  id uuid primary key default gen_random_uuid(),
  appointment_reminder_webhook_id uuid not null references public.appointment_reminder_webhooks (id) on delete cascade,
  -- { phone, customerName, serviceName, barberName, time } tal como lo manda salon-pro.
  payload jsonb not null,
  message_id uuid references public.messages (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index appointment_reminder_events_webhook_idx on public.appointment_reminder_events (appointment_reminder_webhook_id, received_at desc);
create index appointment_reminder_events_unprocessed_idx on public.appointment_reminder_events (received_at) where processed_at is null;

create trigger appointment_reminder_webhooks_set_updated_at
  before update on public.appointment_reminder_webhooks
  for each row execute function public.set_updated_at();

alter table public.appointment_reminder_webhooks enable row level security;
alter table public.appointment_reminder_events enable row level security;

create policy appointment_reminder_webhooks_select on public.appointment_reminder_webhooks
  for select to authenticated
  using (public.is_platform_admin() or company_id = public.current_company_id());

create policy appointment_reminder_webhooks_write_admin on public.appointment_reminder_webhooks
  for all to authenticated
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

create policy appointment_reminder_events_select on public.appointment_reminder_events
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    and exists (
      select 1 from public.appointment_reminder_webhooks w
      where w.id = appointment_reminder_webhook_id
        and (public.is_platform_admin() or w.company_id = public.current_company_id())
    )
  );
