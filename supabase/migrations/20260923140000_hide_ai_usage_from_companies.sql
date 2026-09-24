-- El consumo y el cupo de IA son un manejo interno de la plataforma: las empresas cliente ya
-- no los ven en /settings/ai, y tampoco deben poder leerlos directo contra la API.
-- /plataforma/empresas los sigue leyendo con service role, y el worker también.
drop policy if exists ai_usage_log_select on public.ai_usage_log;
create policy ai_usage_log_select on public.ai_usage_log
  for select to authenticated
  using (public.is_platform_admin());

revoke select (ai_monthly_cap_usd) on public.ai_agent_settings from authenticated;
