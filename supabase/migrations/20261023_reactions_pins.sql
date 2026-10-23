-- ============================================================================
-- KORA — Phase 1 bis : réactions aux messages + messages épinglés
-- Tables : message_reactions, message_pins
-- À exécuter dans l'éditeur SQL Supabase (ré-exécutable sans risque).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists message_reactions_message on public.message_reactions (message_id);

create table if not exists public.message_pins (
  message_id uuid primary key references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id),
  pinned_at timestamptz not null default now()
);

alter table public.message_reactions enable row level security;
alter table public.message_pins enable row level security;

-- --------------------------------------------------------------------------
-- 2. RLS — réactions (lecture/ajout/retrait réservés aux membres du DM)
-- --------------------------------------------------------------------------
drop policy if exists reactions_select on public.message_reactions;
create policy reactions_select on public.message_reactions
  for select to authenticated
  using (exists (
    select 1 from public.messages msg
    where msg.id = message_reactions.message_id and public.is_dm_member(msg.dm_id)
  ));

drop policy if exists reactions_insert on public.message_reactions;
create policy reactions_insert on public.message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages msg
      where msg.id = message_reactions.message_id and public.is_dm_member(msg.dm_id)
    )
  );

drop policy if exists reactions_delete on public.message_reactions;
create policy reactions_delete on public.message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- 3. RLS — épinglés (tout membre du DM peut épingler / désépingler)
-- --------------------------------------------------------------------------
drop policy if exists pins_select on public.message_pins;
create policy pins_select on public.message_pins
  for select to authenticated
  using (exists (
    select 1 from public.messages msg
    where msg.id = message_pins.message_id and public.is_dm_member(msg.dm_id)
  ));

drop policy if exists pins_write on public.message_pins;
create policy pins_write on public.message_pins
  for all to authenticated
  using (exists (
    select 1 from public.messages msg
    where msg.id = message_pins.message_id and public.is_dm_member(msg.dm_id)
  ))
  with check (exists (
    select 1 from public.messages msg
    where msg.id = message_pins.message_id and public.is_dm_member(msg.dm_id)
  ));

-- --------------------------------------------------------------------------
-- 4. Temps réel
-- --------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_pins'
  ) then
    alter publication supabase_realtime add table public.message_pins;
  end if;
end $$;
