-- El agente de IA ahora usa caché de prompt: el costo real depende también de los tokens
-- escritos (1.25x) y leídos (0.1x) del caché, no solo de input/output. Se guardan aparte
-- para poder verificar que el caché está funcionando.
alter table public.ai_usage_log
  add column cache_creation_input_tokens integer not null default 0,
  add column cache_read_input_tokens integer not null default 0;

-- Para sumar rápido el gasto de una conversación (va en el resumen log_customer_note).
create index ai_usage_log_conversation_created_idx on public.ai_usage_log (conversation_id, created_at);
