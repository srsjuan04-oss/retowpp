create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  phone_number_id uuid not null references public.phone_numbers (id),
  status public.conversation_status not null default 'open',
  assigned_to uuid references public.profiles (id),
  assigned_team_id uuid references public.teams (id),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create index conversations_contact_id_idx on public.conversations (contact_id);
create index conversations_assigned_to_idx on public.conversations (assigned_to);
create index conversations_status_idx on public.conversations (status);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- id de mensaje de WhatsApp (wamid). Único: es la clave de idempotencia para
  -- no procesar dos veces el mismo mensaje entrante ni duplicar un envío.
  wamid text unique,
  direction public.message_direction not null,
  sender_type public.message_sender_type not null,
  sender_id uuid references public.profiles (id),
  message_type public.message_type not null,
  content jsonb not null default '{}'::jsonb,
  media_id text,
  status public.message_status not null default 'queued',
  error jsonb,
  -- Generado por el cliente en envíos manuales de agentes para sobrevivir
  -- reintentos de red del UI sin duplicar el mensaje.
  client_dedupe_key uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

create index messages_conversation_id_idx on public.messages (conversation_id, created_at);

create table public.message_status_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  status public.message_status not null,
  raw_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  -- Deduplicación de reentregas exactas del mismo evento de estado de Meta.
  dedupe_key text unique,
  created_at timestamptz not null default now()
);

create index message_status_events_message_id_idx on public.message_status_events (message_id);

-- Helper de visibilidad reutilizado por conversations y messages: agentes ven
-- solo lo asignado a ellos/su equipo (o sin asignar), supervisores/admin ven todo.
create or replace function public.is_conversation_visible(p_assigned_to uuid, p_assigned_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_admin_or_supervisor()
    or p_assigned_to = auth.uid()
    or p_assigned_to is null
    or (
      p_assigned_team_id is not null
      and exists (
        select 1 from public.team_members tm
        where tm.team_id = p_assigned_team_id and tm.profile_id = auth.uid()
      )
    );
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_status_events enable row level security;

create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_conversation_visible(assigned_to, assigned_team_id));

create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (true);

create policy conversations_update on public.conversations
  for update to authenticated
  using (public.is_conversation_visible(assigned_to, assigned_team_id))
  with check (true);

create policy messages_select on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_conversation_visible(c.assigned_to, c.assigned_team_id)
    )
  );

-- Un agente solo puede insertar mensajes propios (sender_type = 'agent' exige
-- sender_id = auth.uid()) en conversaciones que puede ver.
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    (sender_type <> 'agent' or sender_id = auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_conversation_visible(c.assigned_to, c.assigned_team_id)
    )
  );

create policy message_status_events_select on public.message_status_events
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_status_events.message_id
        and public.is_conversation_visible(c.assigned_to, c.assigned_team_id)
    )
  );
