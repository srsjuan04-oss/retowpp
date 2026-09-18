-- Dos barandas para el Agente de IA, ambas opt-in por empresa:
-- 1) Tope de gasto mensual en Anthropic (mismo patrón que ai_monthly_cap_usd en salon-pro,
--    pero acá sí protege el gasto real: reto-whatsapp usa su propia API key por empresa).
-- 2) Restricción de tema: si está activada, un clasificador barato (Haiku) decide si el
--    mensaje del cliente es del tema del negocio antes de gastar en el modelo configurado;
--    si no lo es, se responde con off_topic_reply en vez de llamar al modelo principal.
alter table public.ai_agent_settings
  add column ai_monthly_cap_usd numeric,
  add column topic_restriction boolean not null default false,
  add column off_topic_reply text;

-- ai_agent_settings usa grants por columna (ver 20260806130000_ai_agent.sql): sin este
-- grant, cualquier select/insert/update que toque estas columnas falla para `authenticated`
-- con "permission denied for table ai_agent_settings" — ya nos pasó una vez con
-- phone_numbers.ai_agent_enabled, no repetir el error.
grant select (ai_monthly_cap_usd, topic_restriction, off_topic_reply) on public.ai_agent_settings to authenticated;
grant insert (ai_monthly_cap_usd, topic_restriction, off_topic_reply) on public.ai_agent_settings to authenticated;
grant update (ai_monthly_cap_usd, topic_restriction, off_topic_reply) on public.ai_agent_settings to authenticated;

-- Registro de cada llamada real a Claude (incluida la del clasificador de tema), para poder
-- sumar el gasto del mes en curso y compararlo contra ai_monthly_cap_usd.
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  cost_usd numeric not null,
  created_at timestamptz not null default now()
);

create index ai_usage_log_company_created_idx on public.ai_usage_log (company_id, created_at);

alter table public.ai_usage_log enable row level security;

-- Solo lectura para la empresa dueña (ver su propio gasto en /settings/ai); lo escribe
-- únicamente el worker con el service role, que ignora RLS.
create policy ai_usage_log_select on public.ai_usage_log
  for select to authenticated
  using (public.is_platform_admin() or company_id = public.current_company_id());
