-- Hotfix: listConversations() armaba `.in("id", contactIds)` / `.in("conversation_id",
-- conversationIds)` con cientos de UUIDs. Con 691 contactos y 1097 conversaciones reales,
-- esas URLs pasaron de ~25 a ~40 mil caracteres y PostgREST empezó a rechazarlas con
-- "400 Bad Request", tumbando /inbox en producción para cualquier usuario.
--
-- Esta vista reemplaza el .in(conversation_id, [...]) + reducción en JS por un solo
-- DISTINCT ON en Postgres (usa el índice existente messages_conversation_id_idx). Con
-- security_invoker, hereda la RLS de `messages` (visible solo si la conversación es del
-- usuario/empresa) sin necesitar su propia policy.
create view public.conversation_last_message
  with (security_invoker = true) as
select distinct on (conversation_id)
  conversation_id,
  message_type,
  content,
  created_at
from public.messages
order by conversation_id, created_at desc;

grant select on public.conversation_last_message to authenticated;
