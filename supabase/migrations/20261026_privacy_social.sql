-- Kora — Confidentialité + liens sociaux + sourdines de communautés (2026-10-26)
-- Idempotent, non destructif, compatible avec le schéma actuel.
-- À exécuter dans l'éditeur SQL Supabase (projet fdrygvhfxdzkrwpynntc).
-- Rappel : l'éditeur SQL n'a pas de JWT (auth.uid() NULL) ; ce script ne
-- contient aucune mise à jour protégée par un déclencheur d'admin.

-- 1) Colonnes profils : liens sociaux + règles de confidentialité.
alter table public.profiles
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists privacy_dms text not null default 'friends'
    check (privacy_dms in ('friends', 'nobody')),
  add column if not exists privacy_status text not null default 'everyone'
    check (privacy_status in ('everyone', 'friends', 'nobody'));

-- 2) Sourdines de communautés (par utilisateur, par communauté).
create table if not exists public.community_mutes (
  user_id uuid not null references auth.users (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, community_id)
);
alter table public.community_mutes enable row level security;
drop policy if exists community_mutes_all on public.community_mutes;
create policy community_mutes_all on public.community_mutes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) create_direct_dm renforcé : en plus de l'amitié acceptée exigée,
-- le destinataire doit accepter les messages privés (privacy_dms).
-- CREATE OR REPLACE conserve le grant existant vers authenticated.
create or replace function public.create_direct_dm(p_other uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_dm uuid;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if p_other = v_me then raise exception 'Action impossible avec soi-même'; end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'Utilisateur introuvable';
  end if;
  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = v_me and addressee_id = p_other)
        or (requester_id = p_other and addressee_id = v_me))
  ) then
    raise exception 'Vous devez être amis pour discuter';
  end if;
  if exists (select 1 from public.profiles where id = p_other and privacy_dms = 'nobody') then
    raise exception 'Cet utilisateur n’accepte pas les messages privés.';
  end if;
  v_key := least(v_me, p_other)::text || ':' || greatest(v_me, p_other)::text;
  insert into public.dms (is_group, created_by, dm_key)
    values (false, v_me, v_key)
    on conflict (dm_key) where dm_key is not null do nothing;
  select id into v_dm from public.dms where dm_key = v_key;
  insert into public.dm_members (dm_id, user_id)
    values (v_dm, v_me), (v_dm, p_other)
    on conflict do nothing;
  return v_dm;
end $$;
grant execute on function public.create_direct_dm(uuid) to authenticated;
