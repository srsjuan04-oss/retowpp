-- phone_numbers usa grants por columna (revoke select on public.phone_numbers from
-- authenticated + grant select (lista) ...), no el `select` por defecto de la tabla —
-- ver 20260908180000_embedded_signup.sql. Al agregar ai_agent_enabled en la migración
-- anterior, la columna quedó fuera de esa lista: cualquier select que la incluyera fallaba
-- para el rol `authenticated` con "permission denied for table phone_numbers" (42501),
-- rompiendo la página completa de /settings/waba (no solo el campo nuevo).
grant select (ai_agent_enabled) on public.phone_numbers to authenticated;
