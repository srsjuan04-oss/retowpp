create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  field_type text not null check (field_type in ('text', 'number', 'date', 'boolean', 'select')),
  options jsonb,
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique,
  display_name text,
  consent_status public.consent_status not null default 'pending',
  consent_source text,
  opted_out_at timestamptz,
  blocked_at timestamptz,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#6b7280',
  created_at timestamptz not null default now()
);

create table public.contact_tags (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);

create index contacts_consent_status_idx on public.contacts (consent_status);
create index contact_tags_tag_id_idx on public.contact_tags (tag_id);

alter table public.custom_field_definitions enable row level security;
alter table public.contacts enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;

create policy custom_field_definitions_select on public.custom_field_definitions
  for select to authenticated
  using (true);

create policy custom_field_definitions_write_admin on public.custom_field_definitions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy contacts_select on public.contacts
  for select to authenticated
  using (true);

create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (true);

create policy contacts_update on public.contacts
  for update to authenticated
  using (true)
  with check (true);

create policy contacts_delete_admin on public.contacts
  for delete to authenticated
  using (public.is_admin());

create policy tags_select on public.tags
  for select to authenticated
  using (true);

create policy tags_write_admin_or_supervisor on public.tags
  for all to authenticated
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

create policy contact_tags_select on public.contact_tags
  for select to authenticated
  using (true);

create policy contact_tags_write on public.contact_tags
  for all to authenticated
  using (true)
  with check (true);
