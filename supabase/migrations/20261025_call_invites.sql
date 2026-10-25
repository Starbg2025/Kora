-- Kora — Invitations d'appel (20261025)
-- Table de SONNERIE pour les appels 1:1 : l'appel entrant atteint le
-- destinataire partout dans l'app (pas seulement quand la conversation est
-- ouverte). La négociation WebRTC elle-même reste sur le canal Broadcast
-- `call:<dmId>`. Ré-exécutable sans danger.

create table if not exists public.call_invites (
  id uuid primary key default gen_random_uuid(),
  dm_id uuid not null references public.dms(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('audio', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'declined', 'busy', 'missed', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_invites_callee_idx
  on public.call_invites (callee_id, created_at desc);
create index if not exists call_invites_caller_idx
  on public.call_invites (caller_id, created_at desc);

alter table public.call_invites enable row level security;

-- Lecture : appelant ou appelé uniquement (jamais de sous-requête sur la table).
drop policy if exists call_invites_select on public.call_invites;
create policy call_invites_select on public.call_invites
  for select to authenticated
  using (auth.uid() = caller_id or auth.uid() = callee_id);

-- Création : l'appelant crée sa propre invitation.
drop policy if exists call_invites_insert on public.call_invites;
create policy call_invites_insert on public.call_invites
  for insert to authenticated
  with check (auth.uid() = caller_id);

-- Mise à jour du statut : appelant ou appelé.
drop policy if exists call_invites_update on public.call_invites;
create policy call_invites_update on public.call_invites
  for update to authenticated
  using (auth.uid() = caller_id or auth.uid() = callee_id)
  with check (auth.uid() = caller_id or auth.uid() = callee_id);

-- Publication temps réel (sonnerie).
do $$
begin
  if to_regclass('public.call_invites') is not null
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'call_invites'
    ) then
    execute 'alter publication supabase_realtime add table public.call_invites';
  end if;
end $$;
