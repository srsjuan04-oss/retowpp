-- Interruptor del agente de IA por conversación (además del general de la empresa en
-- ai_agent_settings y del de cada número en phone_numbers.ai_agent_enabled): un agente
-- humano puede tomar una conversación puntual sin que el bot le conteste encima.
-- `authenticated` ya tiene update a nivel de tabla sobre conversations, y la RLS existente
-- limita la fila a la empresa del usuario.
alter table public.conversations add column if not exists ai_agent_paused boolean not null default false;
