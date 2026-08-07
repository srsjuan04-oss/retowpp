-- Extensiones y tipos enumerados compartidos por el resto de migraciones.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

create type public.user_role as enum ('admin', 'supervisor', 'agent');

create type public.consent_status as enum ('subscribed', 'unsubscribed', 'blocked', 'pending');

create type public.conversation_status as enum ('open', 'pending', 'closed');

create type public.message_direction as enum ('inbound', 'outbound');

create type public.message_sender_type as enum ('contact', 'agent', 'system', 'campaign');

create type public.message_type as enum (
  'text', 'template', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'interactive', 'button', 'unknown'
);

create type public.message_status as enum ('queued', 'sent', 'delivered', 'read', 'failed');

create type public.template_status as enum ('approved', 'pending', 'rejected', 'paused', 'disabled');

create type public.campaign_status as enum (
  'draft', 'recipients_locked', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled'
);

create type public.campaign_recipient_status as enum (
  'pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped'
);

-- Trigger genérico para mantener `updated_at` sincronizado.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
