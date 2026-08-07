-- Fix de seguridad: write_audit_log() genérica hace to_jsonb(old)/to_jsonb(new) de la fila
-- completa. Para ai_agent_settings/mcp_servers eso filtraba anthropic_api_key_encrypted /
-- authorization_token_encrypted hacia audit_log — que SÍ es legible por supervisores
-- (is_admin_or_supervisor), anulando el `revoke select` puesto a propósito sobre esas
-- columnas en la tabla original. El texto cifrado no es utilizable sin
-- WABA_TOKEN_ENCRYPTION_KEY (nunca sale del servidor), pero igual no debe existir fuera
-- de su columna. Funciones de auditoría dedicadas que excluyen esas columnas.

create or replace function public.write_ai_agent_settings_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  v_entity_id := coalesce(new.id, old.id);
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    jsonb_build_object(
      'old', case when TG_OP = 'INSERT' then null else to_jsonb(old) - 'anthropic_api_key_encrypted' end,
      'new', case when TG_OP = 'DELETE' then null else to_jsonb(new) - 'anthropic_api_key_encrypted' end
    )
  );
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.write_mcp_servers_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  v_entity_id := coalesce(new.id, old.id);
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    jsonb_build_object(
      'old', case when TG_OP = 'INSERT' then null else to_jsonb(old) - 'authorization_token_encrypted' end,
      'new', case when TG_OP = 'DELETE' then null else to_jsonb(new) - 'authorization_token_encrypted' end
    )
  );
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists ai_agent_settings_audit_insert on public.ai_agent_settings;
drop trigger if exists ai_agent_settings_audit_enabled_change on public.ai_agent_settings;

create trigger ai_agent_settings_audit_insert
  after insert on public.ai_agent_settings
  for each row execute function public.write_ai_agent_settings_audit_log();

create trigger ai_agent_settings_audit_enabled_change
  after update on public.ai_agent_settings
  for each row
  when (new.is_enabled is distinct from old.is_enabled)
  execute function public.write_ai_agent_settings_audit_log();

drop trigger if exists mcp_servers_audit_insert on public.mcp_servers;
drop trigger if exists mcp_servers_audit_active_change on public.mcp_servers;

create trigger mcp_servers_audit_insert
  after insert on public.mcp_servers
  for each row execute function public.write_mcp_servers_audit_log();

create trigger mcp_servers_audit_active_change
  after update on public.mcp_servers
  for each row
  when (new.is_active is distinct from old.is_active)
  execute function public.write_mcp_servers_audit_log();
