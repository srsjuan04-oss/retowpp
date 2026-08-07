-- Conexión con la(s) WABA existente(s) y sus números de teléfono (módulos 1-2 del MVP).
create table public.waba_accounts (
  id uuid primary key default gen_random_uuid(),
  waba_id text not null unique,
  business_name text not null,
  -- Cifrado en la aplicación (packages/core) antes de guardarse; nunca texto plano.
  access_token_encrypted text not null,
  -- Referencia al secreto usado para verificar la firma de webhooks (no el secreto en sí).
  app_secret_ref text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger waba_accounts_set_updated_at
  before update on public.waba_accounts
  for each row execute function public.set_updated_at();

create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  waba_account_id uuid not null references public.waba_accounts (id) on delete cascade,
  phone_number_id text not null unique,
  display_phone_number text not null,
  label text,
  quality_rating text,
  messaging_tier text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.waba_accounts enable row level security;
alter table public.phone_numbers enable row level security;

-- Solo admin/supervisor necesitan ver la configuración de conexión con Meta.
create policy waba_accounts_select on public.waba_accounts
  for select to authenticated
  using (public.is_admin_or_supervisor());

create policy waba_accounts_write_admin on public.waba_accounts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy phone_numbers_select on public.phone_numbers
  for select to authenticated
  using (public.is_admin_or_supervisor());

create policy phone_numbers_write_admin on public.phone_numbers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Defensa en profundidad: aunque alguien obtenga una policy de SELECT sobre
-- waba_accounts, el rol `authenticated` no tiene permiso de columna para leer
-- el token cifrado ni la referencia del app secret. Solo el service role
-- (usado por el receptor de webhooks y el worker) puede leerlas.
revoke select on public.waba_accounts from authenticated;
grant select (id, waba_id, business_name, is_active, created_at, updated_at)
  on public.waba_accounts to authenticated;
