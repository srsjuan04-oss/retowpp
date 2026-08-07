create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  is_team_lead boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, profile_id)
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy teams_select on public.teams
  for select to authenticated
  using (true);

create policy teams_write_admin on public.teams
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy team_members_select on public.team_members
  for select to authenticated
  using (true);

create policy team_members_write_admin on public.team_members
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
