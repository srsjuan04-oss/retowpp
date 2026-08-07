-- Módulo de agente de IA: conecta la app a la API de Claude para que responda
-- automáticamente a mensajes entrantes, opcionalmente usando herramientas MCP
-- externas. Todo lo sensible (API key de Anthropic, tokens de los MCP) va cifrado
-- con la misma clave que ya protege los tokens de WABA (WABA_TOKEN_ENCRYPTION_KEY).

alter type public.message_sender_type add value 'ai_agent';

create table public.ai_agent_settings (
  id uuid primary key default gen_random_uuid(),
  is_enabled boolean not null default false,
  anthropic_api_key_encrypted text not null,
  model text not null default 'claude-opus-5',
  system_prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fuerza una sola fila: la conexión con Claude es de toda la app, no por WABA/número.
create unique index ai_agent_settings_singleton_idx on public.ai_agent_settings ((true));

create trigger ai_agent_settings_set_updated_at
  before update on public.ai_agent_settings
  for each row execute function public.set_updated_at();

alter table public.ai_agent_settings enable row level security;

create policy ai_agent_settings_select on public.ai_agent_settings
  for select to authenticated
  using (public.is_admin_or_supervisor());

create policy ai_agent_settings_write_admin on public.ai_agent_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Defensa en profundidad: la API key de Anthropic nunca es legible desde el
-- cliente autenticado, igual que el access token de WABA.
revoke select on public.ai_agent_settings from authenticated;
grant select (id, is_enabled, model, system_prompt, created_at, updated_at)
  on public.ai_agent_settings to authenticated;

create trigger ai_agent_settings_audit_insert
  after insert on public.ai_agent_settings
  for each row execute function public.write_audit_log();

create trigger ai_agent_settings_audit_enabled_change
  after update on public.ai_agent_settings
  for each row
  when (new.is_enabled is distinct from old.is_enabled)
  execute function public.write_audit_log();

create table public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  url text not null,
  authorization_token_encrypted text,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger mcp_servers_set_updated_at
  before update on public.mcp_servers
  for each row execute function public.set_updated_at();

alter table public.mcp_servers enable row level security;

create policy mcp_servers_select on public.mcp_servers
  for select to authenticated
  using (public.is_admin_or_supervisor());

create policy mcp_servers_write_admin on public.mcp_servers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Defensa en profundidad: el token de autorización del MCP nunca es legible
-- desde el cliente autenticado, igual que el access token de WABA.
revoke select on public.mcp_servers from authenticated;
grant select (id, name, url, is_active, created_by, created_at, updated_at)
  on public.mcp_servers to authenticated;

create trigger mcp_servers_audit_insert
  after insert on public.mcp_servers
  for each row execute function public.write_audit_log();

create trigger mcp_servers_audit_active_change
  after update on public.mcp_servers
  for each row
  when (new.is_active is distinct from old.is_active)
  execute function public.write_audit_log();
