-- Estos "nombres" solo tenían que ser únicos dentro de una empresa, no
-- globalmente en toda la plataforma (dos empresas distintas deben poder
-- tener, cada una, una etiqueta "VIP" o un equipo "Ventas").

alter table public.custom_field_definitions drop constraint custom_field_definitions_key_key;
create unique index custom_field_definitions_company_id_key_key on public.custom_field_definitions (company_id, key);

alter table public.mcp_servers drop constraint mcp_servers_name_key;
create unique index mcp_servers_company_id_name_key on public.mcp_servers (company_id, name);

alter table public.tags drop constraint tags_name_key;
create unique index tags_company_id_name_key on public.tags (company_id, name);

alter table public.teams drop constraint teams_name_key;
create unique index teams_company_id_name_key on public.teams (company_id, name);
