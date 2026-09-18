-- Interruptor del Agente de IA por número, además del general de la empresa
-- en ai_agent_settings. Permite pausar el bot en un número puntual (p. ej.
-- uno personal de prueba) sin afectar el resto ni dejar de recibir/enviar
-- mensajes por ese número.
alter table public.phone_numbers add column ai_agent_enabled boolean not null default true;
