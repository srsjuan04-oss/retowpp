create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.user_role not null default 'agent',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Funciones helper para RLS: SECURITY DEFINER para poder leer profiles sin
-- caer en recursión con las políticas RLS de la propia tabla.
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_admin_or_supervisor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role in ('admin', 'supervisor') from public.profiles where id = auth.uid()), false);
$$;

-- Crea automáticamente el perfil (rol 'agent' por defecto, de mínimo privilegio)
-- cuando se crea un usuario en auth.users. Un admin promueve el rol después.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Solo un admin puede cambiar el rol o desactivar/activar a otro usuario,
-- sin importar qué política de UPDATE permitió llegar hasta aquí.
create or replace function public.enforce_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() es null cuando la operación viene del service role (worker,
  -- SQL editor, seed inicial): ese contexto de sistema/bootstrap es de
  -- confianza y no pasa por esta validación. Cuando sí hay un usuario
  -- autenticado detrás del cambio, se exige que sea admin.
  if auth.uid() is not null
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not public.is_admin() then
    raise exception 'Solo un admin puede cambiar el rol o el estado activo de un perfil';
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_role_change
  before update on public.profiles
  for each row execute function public.enforce_profile_role_change();

alter table public.profiles enable row level security;

-- Herramienta interna: todo usuario autenticado puede ver el directorio de perfiles
-- (nombres/roles) para asignar conversaciones y equipos.
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
