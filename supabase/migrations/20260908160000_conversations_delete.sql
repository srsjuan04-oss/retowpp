-- Antes no existía ninguna policy de DELETE en conversations: con RLS activado,
-- eso significa que nadie (ni admin) podía borrar una conversación desde la app,
-- solo cerrarla. Los mensajes (y flow_runs) referencian conversations con
-- "on delete cascade", así que borrar la conversación se lleva su historial completo.
create policy conversations_delete on public.conversations
  for delete
  using (public.is_admin_or_supervisor() and (public.is_platform_admin() or company_id = public.current_company_id()));
