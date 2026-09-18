-- Hotfix: /stats hacía 5 counts de messages.status + 2 de direction + 3 de
-- conversations.status + 4 de contacts.consent_status, más 1 query de campañas y
-- HASTA 10 queries más (una por campaña) para sus destinatarios — hasta 25 consultas
-- secuenciales/paralelas por carga de página. Bajo uso real eso agota el pool de
-- conexiones de Supabase ("Timed out acquiring connection from connection pool",
-- PGRST003), lo que también explica la lentitud general del sitio.
--
-- Cada vista colapsa su grupo de counts en una sola consulta con GROUP BY. Con
-- security_invoker heredan la RLS de la tabla base tal cual, sin policy propia.
create view public.message_status_counts
  with (security_invoker = true) as
select status, direction, count(*) as count
from public.messages
group by status, direction;

create view public.conversation_status_counts
  with (security_invoker = true) as
select status, count(*) as count
from public.conversations
group by status;

create view public.contact_consent_counts
  with (security_invoker = true) as
select consent_status, count(*) as count
from public.contacts
group by consent_status;

create view public.campaign_recipient_counts
  with (security_invoker = true) as
select campaign_id, status, count(*) as count
from public.campaign_recipients
group by campaign_id, status;

grant select on public.message_status_counts to authenticated;
grant select on public.conversation_status_counts to authenticated;
grant select on public.contact_consent_counts to authenticated;
grant select on public.campaign_recipient_counts to authenticated;
