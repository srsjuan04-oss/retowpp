-- El agente de IA pasa a usar la API key de Anthropic de la plataforma (variable
-- PLATFORM_ANTHROPIC_API_KEY del worker) en vez de pedirle una a cada cliente. Una empresa
-- sin key propia (anthropic_api_key_encrypted = null) gasta de la cuenta de la plataforma,
-- así que siempre tiene tope mensual (default US$10, igual que en SalonPro) y restricción
-- de tema; solo el administrador de plataforma cambia el tope, desde /plataforma/empresas.
alter table public.ai_agent_settings alter column anthropic_api_key_encrypted drop not null;
alter table public.ai_agent_settings alter column ai_monthly_cap_usd set default 10;
alter table public.ai_agent_settings alter column topic_restriction set default true;
alter table public.ai_agent_settings alter column model set default 'claude-sonnet-5';

-- Hasta ahora `authenticated` tenía insert/update sobre TODA la tabla: el admin de una
-- empresa podía subirse el tope (o cambiar la key) directo contra la API aunque la UI no
-- lo mostrara. Ahora solo puede tocar lo que es suyo de verdad; el tope, la key y la
-- restricción de tema los escribe únicamente el service role (panel de plataforma y alta
-- automática desde SalonPro).
revoke insert, update on public.ai_agent_settings from authenticated;
grant insert (company_id, is_enabled, model, system_prompt, off_topic_reply) on public.ai_agent_settings to authenticated;
grant update (is_enabled, model, system_prompt, off_topic_reply) on public.ai_agent_settings to authenticated;
