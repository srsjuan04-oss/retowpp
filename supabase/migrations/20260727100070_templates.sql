create table public.templates (
  id uuid primary key default gen_random_uuid(),
  waba_account_id uuid not null references public.waba_accounts (id) on delete cascade,
  meta_template_id text not null,
  name text not null,
  language text not null,
  category text not null,
  status public.template_status not null,
  components jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (waba_account_id, name, language)
);

create index templates_status_idx on public.templates (status);

alter table public.templates enable row level security;

-- Todo el equipo interno puede ver y elegir plantillas al responder o armar campañas.
create policy templates_select on public.templates
  for select to authenticated
  using (true);

-- La sincronización real la hace el worker con el service role; solo un admin
-- puede forzar cambios manuales desde la app.
create policy templates_write_admin on public.templates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
