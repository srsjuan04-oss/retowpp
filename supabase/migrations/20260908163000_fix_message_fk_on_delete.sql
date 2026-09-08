-- El borrado de conversaciones (conversations_delete) cascadea a messages, pero
-- campaign_recipients.message_id y hotmart_webhook_events.message_id no tenían
-- ON DELETE definido (=> RESTRICT): borrar una conversación con un mensaje que
-- vino de una campaña o de Hotmart tronaba con "violates foreign key constraint".
-- Se deja el registro de campaña/hotmart (no forma parte de la conversación que
-- se está borrando) y solo se limpia la referencia, igual que ya hace
-- appointment_reminder_events.message_id.
alter table public.campaign_recipients
  drop constraint campaign_recipients_message_id_fkey,
  add constraint campaign_recipients_message_id_fkey
    foreign key (message_id) references public.messages (id) on delete set null;

alter table public.hotmart_webhook_events
  drop constraint hotmart_webhook_events_message_id_fkey,
  add constraint hotmart_webhook_events_message_id_fkey
    foreign key (message_id) references public.messages (id) on delete set null;
