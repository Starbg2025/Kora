-- ============================================================================
-- KORA — Sondages dans les discussions + couleur de bannière de profil
-- Tables : message_polls, message_poll_votes ; profiles.banner_color
-- À exécuter dans l'éditeur SQL Supabase (ré-exécutable sans risque).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Couleur de bannière (personnalisation gratuite du profil)
-- --------------------------------------------------------------------------
alter table public.profiles add column if not exists banner_color text;

-- --------------------------------------------------------------------------
-- 2. Tables des sondages
-- --------------------------------------------------------------------------
create table if not exists public.message_polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  question text not null,
  options jsonb not null,
  created_by uuid not null references public.profiles(id),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 10)
);
create index if not exists message_polls_message on public.message_polls (message_id);

create table if not exists public.message_poll_votes (
  poll_id uuid not null references public.message_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index int not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index if not exists message_poll_votes_poll on public.message_poll_votes (poll_id);

alter table public.message_polls enable row level security;
alter table public.message_poll_votes enable row level security;

-- --------------------------------------------------------------------------
-- 3. RLS — sondages (réservés aux membres de la discussion)
-- --------------------------------------------------------------------------
drop policy if exists polls_select on public.message_polls;
create policy polls_select on public.message_polls
  for select to authenticated
  using (exists (
    select 1 from public.messages msg
    join public.dm_members m on m.dm_id = msg.dm_id
    where msg.id = message_polls.message_id and m.user_id = auth.uid()
  ));

drop policy if exists polls_insert on public.message_polls;
create policy polls_insert on public.message_polls
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.messages msg
      join public.dm_members m on m.dm_id = msg.dm_id
      where msg.id = message_polls.message_id and m.user_id = auth.uid()
    )
  );

drop policy if exists polls_delete on public.message_polls;
create policy polls_delete on public.message_polls
  for delete to authenticated
  using (created_by = auth.uid());

-- --------------------------------------------------------------------------
-- 4. RLS — votes (un vote par personne, modifiable)
-- --------------------------------------------------------------------------
drop policy if exists poll_votes_select on public.message_poll_votes;
create policy poll_votes_select on public.message_poll_votes
  for select to authenticated
  using (exists (
    select 1 from public.message_polls p
    join public.messages msg on msg.id = p.message_id
    join public.dm_members m on m.dm_id = msg.dm_id
    where p.id = message_poll_votes.poll_id and m.user_id = auth.uid()
  ));

drop policy if exists poll_votes_insert on public.message_poll_votes;
create policy poll_votes_insert on public.message_poll_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.message_polls p
      join public.messages msg on msg.id = p.message_id
      join public.dm_members m on m.dm_id = msg.dm_id
      where p.id = message_poll_votes.poll_id and m.user_id = auth.uid()
    )
  );

drop policy if exists poll_votes_delete on public.message_poll_votes;
create policy poll_votes_delete on public.message_poll_votes
  for delete to authenticated
  using (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- 5. Temps réel
-- --------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_polls'
  ) then
    alter publication supabase_realtime add table public.message_polls;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_poll_votes'
  ) then
    alter publication supabase_realtime add table public.message_poll_votes;
  end if;
end $$;
