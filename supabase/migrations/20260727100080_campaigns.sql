create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id uuid not null references public.templates (id),
  variable_mapping jsonb not null default '{}'::jsonb,
  audience_filter jsonb not null default '{}'::jsonb,
  status public.campaign_status not null default 'draft',
  created_by uuid references public.profiles (id),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create index campaigns_status_idx on public.campaigns (status);

-- Snapshot inmutable de destinatarios, materializado ANTES de iniciar el envío
-- (regla obligatoria: guardar destinatarios definitivos antes de iniciar la campaña).
create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  contact_id uuid not null references public.contacts (id),
  phone_number_snapshot text not null,
  variables jsonb not null default '{}'::jsonb,
  status public.campaign_recipient_status not null default 'pending',
  skip_reason text,
  message_id uuid references public.messages (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Idempotencia: un contacto no puede quedar duplicado dentro de la misma campaña.
  unique (campaign_id, contact_id)
);

create trigger campaign_recipients_set_updated_at
  before update on public.campaign_recipients
  for each row execute function public.set_updated_at();

create index campaign_recipients_campaign_id_idx on public.campaign_recipients (campaign_id, status);

create table public.campaign_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  batch_index integer not null,
  contact_count integer not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, batch_index)
);

alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_batches enable row level security;

create policy campaigns_select on public.campaigns
  for select to authenticated
  using (true);

-- Enviar campañas es una acción de riesgo para la cuenta de WhatsApp: solo
-- admin/supervisor pueden crearlas, editarlas e iniciarlas.
create policy campaigns_write_admin_or_supervisor on public.campaigns
  for all to authenticated
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

create policy campaign_recipients_select on public.campaign_recipients
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- El "lock" de destinatarios lo hace un admin/supervisor desde la app; el resto
-- de actualizaciones de estado (sent/delivered/...) las hace el worker vía service role.
create policy campaign_recipients_insert on public.campaign_recipients
  for insert to authenticated
  with check (public.is_admin_or_supervisor());

create policy campaign_batches_select on public.campaign_batches
  for select to authenticated
  using (public.is_admin_or_supervisor());
