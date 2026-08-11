-- Mensajes disparados por un evento de Hotmart necesitan su propio sender_type
-- para diferenciarlos de un envío manual o de campaña en la auditoría/inbox.
alter type public.message_sender_type add value 'hotmart';
