-- Multi-tenancy: cada empresa (company) tiene su propia WABA y sus datos
-- completamente aislados del resto. Este archivo:
--   1) crea `companies` y agrega `company_id` a las tablas "raíz" (17 + profiles);
--   2) migra los datos existentes a una única "Empresa 1" y marca al único
--      usuario actual como administrador de plataforma;
--   3) agrega los helpers is_platform_admin()/current_company_id();
--   4) reescribe TODAS las políticas RLS para exigir coincidencia de empresa
--      (o ser administrador de plataforma), además de los checks de rol que
--      ya existían.
--
-- Tablas SIN columna propia (se resuelven por join a su tabla padre, ya
-- escopeada, siguiendo el mismo patrón que ya usan messages_select /
-- message_status_events_select hoy): team_members, contact_tags, messages,
-- message_status_events, campaign_recipients, campaign_batches, flow_steps,
-- flow_branches, flow_runs, hotmart_webhook_events.

-- ============================================================
-- 1) Tabla companies + columnas company_id
-- ============================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;

insert into public.companies (name) values ('Empresa 1');

alter table public.profiles add column company_id uuid references public.companies (id);
alter table public.profiles add column is_platform_admin boolean not null default false;

alter table public.waba_accounts add column company_id uuid references public.companies (id);
alter table public.phone_numbers add column company_id uuid references public.companies (id);
alter table public.teams add column company_id uuid references public.companies (id);
alter table public.custom_field_definitions add column company_id uuid references public.companies (id);
alter table public.contacts add column company_id uuid references public.companies (id);
alter table public.tags add column company_id uuid references public.companies (id);
alter table public.webhook_events add column company_id uuid references public.companies (id);
alter table public.conversations add column company_id uuid references public.companies (id);
alter table public.templates add column company_id uuid references public.companies (id);
alter table public.campaigns add column company_id uuid references public.companies (id);
alter table public.contact_imports add column company_id uuid references public.companies (id);
alter table public.audit_log add column company_id uuid references public.companies (id);
alter table public.ai_agent_settings add column company_id uuid references public.companies (id);
alter table public.mcp_servers add column company_id uuid references public.companies (id);
alter table public.flows add column company_id uuid references public.companies (id);
alter table public.hotmart_webhooks add column company_id uuid references public.companies (id);

-- ============================================================
-- 2) Backfill: todo lo existente pertenece a "Empresa 1"
-- ============================================================

do $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from public.companies order by created_at asc limit 1;

  update public.profiles set company_id = v_company_id where company_id is null;
  update public.waba_accounts set company_id = v_company_id where company_id is null;
  update public.phone_numbers set company_id = v_company_id where company_id is null;
  update public.teams set company_id = v_company_id where company_id is null;
  update public.custom_field_definitions set company_id = v_company_id where company_id is null;
  update public.contacts set company_id = v_company_id where company_id is null;
  update public.tags set company_id = v_company_id where company_id is null;
  update public.webhook_events set company_id = v_company_id where company_id is null;
  update public.conversations set company_id = v_company_id where company_id is null;
  update public.templates set company_id = v_company_id where company_id is null;
  update public.campaigns set company_id = v_company_id where company_id is null;
  update public.contact_imports set company_id = v_company_id where company_id is null;
  update public.audit_log set company_id = v_company_id where company_id is null;
  update public.ai_agent_settings set company_id = v_company_id where company_id is null;
  update public.mcp_servers set company_id = v_company_id where company_id is null;
  update public.flows set company_id = v_company_id where company_id is null;
  update public.hotmart_webhooks set company_id = v_company_id where company_id is null;
end $$;

-- El único usuario existente hoy pasa a ser, además, administrador de plataforma
-- (puede crear otras empresas). Sigue perteneciendo a Empresa 1 como su dueño.
update public.profiles p
set is_platform_admin = true
from auth.users u
where u.id = p.id and u.email = 'srsjuan04@gmail.com';

-- ============================================================
-- 3) NOT NULL + FK ya definida arriba (profiles.company_id queda nullable:
--    los administradores de plataforma no pertenecen a ninguna empresa)
-- ============================================================

alter table public.waba_accounts alter column company_id set not null;
alter table public.phone_numbers alter column company_id set not null;
alter table public.teams alter column company_id set not null;
alter table public.custom_field_definitions alter column company_id set not null;
alter table public.contacts alter column company_id set not null;
alter table public.tags alter column company_id set not null;
alter table public.conversations alter column company_id set not null;
alter table public.templates alter column company_id set not null;
alter table public.campaigns alter column company_id set not null;
alter table public.contact_imports alter column company_id set not null;
alter table public.ai_agent_settings alter column company_id set not null;
alter table public.mcp_servers alter column company_id set not null;
alter table public.flows alter column company_id set not null;
alter table public.hotmart_webhooks alter column company_id set not null;
-- webhook_events y audit_log quedan nullable: pueden llegar eventos de una
-- waba_id que Meta manda pero que todavía no está registrada en nuestra DB.

-- ai_agent_settings deja de ser un singleton global: ahora es una fila por empresa.
drop index if exists public.ai_agent_settings_singleton_idx;
create unique index ai_agent_settings_company_idx on public.ai_agent_settings (company_id);

-- ============================================================
-- 4) Helpers, mismo estilo que is_admin()/is_admin_or_supervisor()
-- ============================================================

create function public.is_platform_admin()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

create function public.current_company_id()
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- handle_new_user(): los usuarios nuevos ya no se autoregistran, los crea un
-- administrador de plataforma vía auth.admin.createUser con company_id/role
-- en user_metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, company_id, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    nullif(new.raw_user_meta_data ->> 'company_id', '')::uuid,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'agent')
  );
  return new;
end;
$$;

-- ============================================================
-- 5) RLS: companies
-- ============================================================

create policy companies_select on public.companies
  for select
  using (public.is_platform_admin() or id = public.current_company_id());

create policy companies_write_platform_admin on public.companies
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ============================================================
-- 6) RLS: tablas con company_id propio
-- ============================================================

drop policy if exists ai_agent_settings_select on public.ai_agent_settings;
create policy ai_agent_settings_select on public.ai_agent_settings
  for select
  using (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists ai_agent_settings_write_admin on public.ai_agent_settings;
create policy ai_agent_settings_write_admin on public.ai_agent_settings
  for all
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists audit_log_insert_self on public.audit_log;
create policy audit_log_insert_self on public.audit_log
  for insert
  with check (actor_id = auth.uid() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists audit_log_select_admin_or_supervisor on public.audit_log;
create policy audit_log_select_admin_or_supervisor on public.audit_log
  for select
  using (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
  for select
  using (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists campaigns_write_admin_or_supervisor on public.campaigns;
create policy campaigns_write_admin_or_supervisor on public.campaigns
  for all
  using (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists contact_imports_insert on public.contact_imports;
create policy contact_imports_insert on public.contact_imports
  for insert
  with check (uploaded_by = auth.uid() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists contact_imports_select on public.contact_imports;
create policy contact_imports_select on public.contact_imports
  for select
  using (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists contacts_delete_admin on public.contacts;
create policy contacts_delete_admin on public.contacts
  for delete
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert
  with check (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select
  using (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update
  using (public.is_platform_admin() or company_id = public.current_company_id())
  with check (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert
  with check (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select
  using (public.is_conversation_visible(assigned_to, assigned_team_id) and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update
  using (public.is_conversation_visible(assigned_to, assigned_team_id) and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists custom_field_definitions_select on public.custom_field_definitions;
create policy custom_field_definitions_select on public.custom_field_definitions
  for select
  using (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists custom_field_definitions_write_admin on public.custom_field_definitions;
create policy custom_field_definitions_write_admin on public.custom_field_definitions
  for all
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists flows_select on public.flows;
create policy flows_select on public.flows
  for select
  using (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists flows_write_admin on public.flows;
create policy flows_write_admin on public.flows
  for all
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists hotmart_webhooks_select on public.hotmart_webhooks;
create policy hotmart_webhooks_select on public.hotmart_webhooks
  for select
  using (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists hotmart_webhooks_write_admin on public.hotmart_webhooks;
create policy hotmart_webhooks_write_admin on public.hotmart_webhooks
  for all
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists mcp_servers_select on public.mcp_servers;
create policy mcp_servers_select on public.mcp_servers
  for select
  using (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists mcp_servers_write_admin on public.mcp_servers;
create policy mcp_servers_write_admin on public.mcp_servers
  for all
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists phone_numbers_select on public.phone_numbers;
create policy phone_numbers_select on public.phone_numbers
  for select
  using (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists phone_numbers_write_admin on public.phone_numbers;
create policy phone_numbers_write_admin on public.phone_numbers
  for all
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  using (public.is_platform_admin() or id = auth.uid() or company_id = public.current_company_id());

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
  for update
  using (id = auth.uid() or public.is_platform_admin() or (public.is_admin() and company_id = public.current_company_id()))
  with check (id = auth.uid() or public.is_platform_admin() or (public.is_admin() and company_id = public.current_company_id()));

drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags
  for select
  using (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists tags_write_admin_or_supervisor on public.tags;
create policy tags_write_admin_or_supervisor on public.tags
  for all
  using (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select
  using (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists teams_write_admin on public.teams;
create policy teams_write_admin on public.teams
  for all
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists templates_select on public.templates;
create policy templates_select on public.templates
  for select
  using (public.is_platform_admin() or company_id = public.current_company_id());

drop policy if exists templates_write_admin on public.templates;
create policy templates_write_admin on public.templates
  for all
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists waba_accounts_select on public.waba_accounts;
create policy waba_accounts_select on public.waba_accounts
  for select
  using (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists waba_accounts_write_admin on public.waba_accounts;
create policy waba_accounts_write_admin on public.waba_accounts
  for all
  using (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()))
  with check (public.is_admin() and (public.is_platform_admin() or company_id = public.current_company_id()));

drop policy if exists webhook_events_select_admin on public.webhook_events;
create policy webhook_events_select_admin on public.webhook_events
  for select
  using (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()));

-- ============================================================
-- 7) RLS: tablas derivadas (sin company_id propio, join a la tabla padre)
-- ============================================================

drop policy if exists campaign_batches_select on public.campaign_batches;
create policy campaign_batches_select on public.campaign_batches
  for select
  using (
    public.is_admin_or_supervisor()
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_batches.campaign_id
        and (public.is_platform_admin() or c.company_id = public.current_company_id())
    )
  );

drop policy if exists campaign_recipients_insert on public.campaign_recipients;
create policy campaign_recipients_insert on public.campaign_recipients
  for insert
  with check (
    public.is_admin_or_supervisor()
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_recipients.campaign_id
        and (public.is_platform_admin() or c.company_id = public.current_company_id())
    )
  );

drop policy if exists campaign_recipients_select on public.campaign_recipients;
create policy campaign_recipients_select on public.campaign_recipients
  for select
  using (
    public.is_admin_or_supervisor()
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_recipients.campaign_id
        and (public.is_platform_admin() or c.company_id = public.current_company_id())
    )
  );

drop policy if exists contact_tags_select on public.contact_tags;
create policy contact_tags_select on public.contact_tags
  for select
  using (
    exists (
      select 1 from public.contacts ct
      where ct.id = contact_tags.contact_id
        and (public.is_platform_admin() or ct.company_id = public.current_company_id())
    )
  );

drop policy if exists contact_tags_write on public.contact_tags;
create policy contact_tags_write on public.contact_tags
  for all
  using (
    exists (
      select 1 from public.contacts ct
      where ct.id = contact_tags.contact_id
        and (public.is_platform_admin() or ct.company_id = public.current_company_id())
    )
  )
  with check (
    exists (
      select 1 from public.contacts ct
      where ct.id = contact_tags.contact_id
        and (public.is_platform_admin() or ct.company_id = public.current_company_id())
    )
  );

drop policy if exists flow_branches_select on public.flow_branches;
create policy flow_branches_select on public.flow_branches
  for select
  using (
    exists (
      select 1 from public.flow_steps fs join public.flows f on f.id = fs.flow_id
      where fs.id = flow_branches.from_step_id
        and (public.is_platform_admin() or f.company_id = public.current_company_id())
    )
  );

drop policy if exists flow_branches_write_admin on public.flow_branches;
create policy flow_branches_write_admin on public.flow_branches
  for all
  using (
    public.is_admin()
    and exists (
      select 1 from public.flow_steps fs join public.flows f on f.id = fs.flow_id
      where fs.id = flow_branches.from_step_id
        and (public.is_platform_admin() or f.company_id = public.current_company_id())
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.flow_steps fs join public.flows f on f.id = fs.flow_id
      where fs.id = flow_branches.from_step_id
        and (public.is_platform_admin() or f.company_id = public.current_company_id())
    )
  );

drop policy if exists flow_runs_select on public.flow_runs;
create policy flow_runs_select on public.flow_runs
  for select
  using (
    exists (
      select 1 from public.flows f
      where f.id = flow_runs.flow_id
        and (public.is_platform_admin() or f.company_id = public.current_company_id())
    )
  );

drop policy if exists flow_steps_select on public.flow_steps;
create policy flow_steps_select on public.flow_steps
  for select
  using (
    exists (
      select 1 from public.flows f
      where f.id = flow_steps.flow_id
        and (public.is_platform_admin() or f.company_id = public.current_company_id())
    )
  );

drop policy if exists flow_steps_write_admin on public.flow_steps;
create policy flow_steps_write_admin on public.flow_steps
  for all
  using (
    public.is_admin()
    and exists (
      select 1 from public.flows f
      where f.id = flow_steps.flow_id
        and (public.is_platform_admin() or f.company_id = public.current_company_id())
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.flows f
      where f.id = flow_steps.flow_id
        and (public.is_platform_admin() or f.company_id = public.current_company_id())
    )
  );

drop policy if exists hotmart_webhook_events_select_admin on public.hotmart_webhook_events;
create policy hotmart_webhook_events_select_admin on public.hotmart_webhook_events
  for select
  using (
    public.is_admin_or_supervisor()
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.hotmart_webhooks hw
        where hw.id = hotmart_webhook_events.hotmart_webhook_id
          and hw.company_id = public.current_company_id()
      )
    )
  );

drop policy if exists message_status_events_select on public.message_status_events;
create policy message_status_events_select on public.message_status_events
  for select
  using (
    exists (
      select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.id = message_status_events.message_id
        and is_conversation_visible(c.assigned_to, c.assigned_team_id)
        and (public.is_platform_admin() or c.company_id = public.current_company_id())
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert
  with check (
    ((sender_type <> 'agent'::message_sender_type) or (sender_id = auth.uid()))
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and is_conversation_visible(c.assigned_to, c.assigned_team_id)
        and (public.is_platform_admin() or c.company_id = public.current_company_id())
    )
  );

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and is_conversation_visible(c.assigned_to, c.assigned_team_id)
        and (public.is_platform_admin() or c.company_id = public.current_company_id())
    )
  );

drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and (public.is_platform_admin() or t.company_id = public.current_company_id())
    )
  );

drop policy if exists team_members_write_admin on public.team_members;
create policy team_members_write_admin on public.team_members
  for all
  using (
    public.is_admin()
    and exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and (public.is_platform_admin() or t.company_id = public.current_company_id())
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and (public.is_platform_admin() or t.company_id = public.current_company_id())
    )
  );

-- ============================================================
-- 8) Storage: los CSV de importación de contactos también se aíslan por
--    empresa (antes cualquier admin/supervisor de CUALQUIER empresa podía
--    leer el archivo subido por cualquier otra).
-- ============================================================

drop policy if exists contact_imports_bucket_select on storage.objects;
create policy contact_imports_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contact-imports'
    and (
      owner = auth.uid()
      or (
        public.is_admin_or_supervisor()
        and exists (
          select 1 from public.profiles p
          where p.id = storage.objects.owner
            and (public.is_platform_admin() or p.company_id = public.current_company_id())
        )
      )
    )
  );
