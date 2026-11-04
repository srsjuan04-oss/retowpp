-- /inbox daba "canceling statement due to statement timeout" (57014). La vista anterior hacía
-- DISTINCT ON sobre TODOS los mensajes (~92 mil), y con security_invoker la RLS de `messages`
-- (EXISTS sobre conversations + is_conversation_visible) se evaluaba por cada fila.
--
-- Ahora se parte de `conversations` (su RLS ya filtra por empresa/visibilidad) y por cada una
-- se toma solo su último mensaje con LATERAL ... LIMIT 1, que recorre hacia atrás el índice
-- existente messages_conversation_id_idx (conversation_id, created_at). Mismas columnas, así
-- que listConversations() no cambia.
create or replace view public.conversation_last_message
  with (security_invoker = true) as
select
  c.id as conversation_id,
  m.message_type,
  m.content,
  m.created_at
from public.conversations c
cross join lateral (
  select msg.message_type, msg.content, msg.created_at
  from public.messages msg
  where msg.conversation_id = c.id
  order by msg.created_at desc
  limit 1
) m;

grant select on public.conversation_last_message to authenticated;
