-- Módulo de flujos: automatiza una respuesta (texto/imagen/audio) cuando un
-- contacto responde a una plantilla específica, con ramas según lo que conteste.

create type public.flow_step_content_type as enum ('text', 'image', 'audio');
create type public.flow_branch_match_type as enum ('any', 'equals', 'contains');
create type public.flow_run_status as enum ('active', 'completed');

create table public.flows (
  id uuid primary key default gen_random_uuid(),
  waba_account_id uuid not null references public.waba_accounts (id) on delete cascade,
  template_id uuid not null references public.templates (id),
  name text not null,
  is_active boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger flows_set_updated_at
  before update on public.flows
  for each row execute function public.set_updated_at();

create index flows_template_id_idx on public.flows (template_id);

-- Un solo flujo activo por plantilla: evita ambigüedad sobre cuál dispara al responder.
create unique index flows_active_template_unique on public.flows (template_id) where is_active;

alter table public.flows enable row level security;

create policy flows_select on public.flows
  for select to authenticated
  using (true);

-- Crear/editar flujos toca el envío automático de mensajes: solo admin.
create policy flows_write_admin on public.flows
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table public.flow_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows (id) on delete cascade,
  step_order int not null,
  content_type public.flow_step_content_type not null,
  text_body text,
  media_path text,
  media_mime_type text,
  created_at timestamptz not null default now(),
  unique (flow_id, step_order)
);

alter table public.flow_steps enable row level security;

create policy flow_steps_select on public.flow_steps
  for select to authenticated
  using (true);

create policy flow_steps_write_admin on public.flow_steps
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table public.flow_branches (
  id uuid primary key default gen_random_uuid(),
  from_step_id uuid not null references public.flow_steps (id) on delete cascade,
  match_type public.flow_branch_match_type not null,
  match_value text,
  -- null = termina el flujo en esta rama.
  to_step_id uuid references public.flow_steps (id) on delete set null,
  priority int not null default 0,
  created_at timestamptz not null default now()
);

create index flow_branches_from_step_idx on public.flow_branches (from_step_id, priority);

alter table public.flow_branches enable row level security;

create policy flow_branches_select on public.flow_branches
  for select to authenticated
  using (true);

create policy flow_branches_write_admin on public.flow_branches
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Estado de avance de un contacto dentro de un flujo. Solo el worker (service role)
-- escribe aquí; el equipo interno solo necesita poder verlo para depurar.
create table public.flow_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  current_step_id uuid references public.flow_steps (id),
  status public.flow_run_status not null default 'active',
  -- wamid del mensaje de plantilla que originó este run: evita arrancar el
  -- mismo flujo dos veces para el mismo envío si el webhook se reintenta.
  trigger_wamid text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (flow_id, trigger_wamid)
);

create index flow_runs_contact_status_idx on public.flow_runs (contact_id, status);

alter table public.flow_runs enable row level security;

create policy flow_runs_select on public.flow_runs
  for select to authenticated
  using (true);

-- Bucket privado para las imágenes/audios usados como contenido de un paso.
insert into storage.buckets (id, name, public)
values ('flow-media', 'flow-media', false)
on conflict (id) do nothing;

create policy flow_media_bucket_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'flow-media' and public.is_admin());

create policy flow_media_bucket_select on storage.objects
  for select to authenticated
  using (bucket_id = 'flow-media' and (owner = auth.uid() or public.is_admin_or_supervisor()));

-- Creación de flujos y activación/desactivación: acción sensible (envía mensajes solo).
create trigger flows_audit_insert
  after insert on public.flows
  for each row execute function public.write_audit_log();

create trigger flows_audit_active_change
  after update on public.flows
  for each row
  when (new.is_active is distinct from old.is_active)
  execute function public.write_audit_log();
