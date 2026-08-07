create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

create policy audit_log_select_admin_or_supervisor on public.audit_log
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- Permite que la propia aplicación registre eventos puntuales (p. ej. exportar
-- contactos) atribuidos siempre al usuario autenticado, nunca a otro. El registro
-- es inmutable: no hay política de UPDATE ni DELETE para `authenticated`.
create policy audit_log_insert_self on public.audit_log
  for insert to authenticated
  with check (actor_id = auth.uid());

-- Trigger genérico: registra OLD/NEW completos de la fila en metadata.
-- OLD no está asignado en absoluto durante un INSERT (no simplemente NULL:
-- referenciarlo lanza "record old is not assigned yet"), y NEW no existe en
-- un DELETE, así que hay que ramificar por TG_OP en vez de usar OLD/NEW directo.
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_entity_id := old.id;
  else
    v_entity_id := new.id;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    jsonb_build_object(
      'old', case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
      'new', case when TG_OP = 'DELETE' then null else to_jsonb(new) end
    )
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Cambios de rol/estado activo de un perfil.
create trigger profiles_audit_role_change
  after update on public.profiles
  for each row
  when (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
  execute function public.write_audit_log();

-- Asignación y cierre/reapertura de conversaciones.
create trigger conversations_audit_assignment_change
  after update on public.conversations
  for each row
  when (
    new.assigned_to is distinct from old.assigned_to
    or new.assigned_team_id is distinct from old.assigned_team_id
    or new.status is distinct from old.status
  )
  execute function public.write_audit_log();

-- Cambios de consentimiento/exclusión de un contacto.
create trigger contacts_audit_consent_change
  after update on public.contacts
  for each row
  when (new.consent_status is distinct from old.consent_status)
  execute function public.write_audit_log();

-- Creación de campañas y cambios de estado (incluye el inicio del envío).
create trigger campaigns_audit_insert
  after insert on public.campaigns
  for each row execute function public.write_audit_log();

create trigger campaigns_audit_status_change
  after update on public.campaigns
  for each row
  when (new.status is distinct from old.status)
  execute function public.write_audit_log();
