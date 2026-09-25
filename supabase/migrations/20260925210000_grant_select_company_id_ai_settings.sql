-- /settings/ai filtra por company_id: un administrador de plataforma ve por RLS las filas de
-- todas las empresas, así que sin el filtro la página mezclaba empresas. Filtrar exige poder
-- leer la columna; company_id no es sensible y RLS sigue limitando qué filas ve cada usuario.
grant select (company_id) on public.ai_agent_settings to authenticated;
grant select (company_id) on public.mcp_servers to authenticated;
