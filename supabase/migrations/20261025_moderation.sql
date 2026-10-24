-- ============================================================================
-- KORA — PHASE 7 : Modération et administration
-- Tables : server_bans, server_timeouts, reports, audit_logs.
-- RÈGLE D'OR : aucune policy ne sous-interroge sa propre table (récursion
-- infinie 42P17). On utilise des helpers SECURITY DEFINER qui contournent
-- la RLS en interne (motif is_dm_member / can_moderate).
-- À exécuter dans l'éditeur SQL Supabase (ré-exécutable sans risque).
-- PRÉREQUIS : 20261024_phase2_communities.sql (communities, community_members,
--   helpers is_community_member / community_role / can_moderate).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------
create table if not exists public.server_bans (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid not null references public.profiles(id),
  reason text not null default '',
  expires_at timestamptz, -- null = définitif
  created_at timestamptz not null default now(),
  unique (community_id, user_id)
);
create index if not exists server_bans_community on public.server_bans (community_id);

create table if not exists public.server_timeouts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  moderator_id uuid not null references public.profiles(id),
  reason text not null default '',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists server_timeouts_community on public.server_timeouts (community_id, expires_at);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade, -- null = message privé
  message_kind text not null check (message_kind in ('dm', 'channel')),
  message_id uuid not null,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harcelement', 'contenu_inapproprie', 'autre')),
  details text not null default '',
  status text not null default 'nouveau'
    check (status in ('nouveau', 'en_cours', 'resolu', 'rejete')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reports_community on public.reports (community_id, created_at desc);
create index if not exists reports_reporter on public.reports (reporter_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null default '',
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_community on public.audit_logs (community_id, created_at desc);

alter table public.server_bans enable row level security;
alter table public.server_timeouts enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;

-- --------------------------------------------------------------------------
-- 2. Helpers SECURITY DEFINER (aucune récursion possible)
-- --------------------------------------------------------------------------
create or replace function public.is_community_admin(p_community uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select public.community_role(p_community) in ('proprietaire', 'admin');
$$;

-- Rang numérique d'un membre (0 = non membre)
create or replace function public.community_role_rank(p_community uuid, p_user uuid)
returns int
language sql security definer set search_path = public stable
as $$
  select coalesce(
    array_position(array['membre', 'moderateur', 'admin', 'proprietaire'],
      (select role from public.community_members
       where community_id = p_community and user_id = p_user)),
    0);
$$;

create or replace function public.has_active_timeout(p_community uuid, p_user uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.server_timeouts
    where community_id = p_community and user_id = p_user and expires_at > now()
  );
$$;

create or replace function public.is_banned(p_community uuid, p_user uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.server_bans
    where community_id = p_community and user_id = p_user
      and (expires_at is null or expires_at > now())
  );
$$;

-- --------------------------------------------------------------------------
-- 3. RLS — lecture seule côté client, écriture via les fonctions ci-dessous
--    (SECURITY DEFINER, donc non soumises aux policies).
-- --------------------------------------------------------------------------
drop policy if exists server_bans_select on public.server_bans;
create policy server_bans_select on public.server_bans
  for select to authenticated
  using (public.can_moderate(community_id));

drop policy if exists server_timeouts_select on public.server_timeouts;
create policy server_timeouts_select on public.server_timeouts
  for select to authenticated
  using (user_id = auth.uid() or public.can_moderate(community_id));

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (
    reporter_id = auth.uid()
    or (community_id is not null and public.can_moderate(community_id))
  );

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.can_moderate(community_id));

-- --------------------------------------------------------------------------
-- 4. Durcissement : un membre banni ne peut pas se réinscrire directement
--    (la policy d'insert de community_members autorisait tout membre d'une
--    communauté publique ; on ajoute le contrôle anti-ban).
-- --------------------------------------------------------------------------
drop policy if exists community_members_insert on public.community_members;
create policy community_members_insert on public.community_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_banned(community_id, auth.uid())
    and (
      public.is_community_member(community_id)
      or exists (select 1 from public.communities c where c.id = community_members.community_id and c.is_public)
    )
  );

-- --------------------------------------------------------------------------
-- 5. Application des timeouts : un membre en timeout ne peut plus écrire
--    dans les salons de la communauté (la policy fait foi côté serveur).
-- --------------------------------------------------------------------------
drop policy if exists community_messages_insert on public.community_messages;
create policy community_messages_insert on public.community_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_channel_member(channel_id)
    and not exists (
      select 1 from public.channels c
      where c.id = community_messages.channel_id
        and public.has_active_timeout(c.community_id, auth.uid())
    )
  );

-- --------------------------------------------------------------------------
-- 6. Fonctions métier (SECURITY DEFINER, vérification de rang stricte)
--    Rangs : membre 1 < moderateur 2 < admin 3 < proprietaire 4.
--    Pour modérer quelqu'un, il faut un rang >= 2 ET strictement supérieur.
-- --------------------------------------------------------------------------

-- Bannir : supprime l'accès immédiatement (ligne community_members effacée)
create or replace function public.ban_member(p_community uuid, p_user uuid, p_reason text, p_expires timestamptz)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_caller_rank int;
  v_target_rank int;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if p_user = v_me then raise exception 'Tu ne peux pas te bannir toi-même'; end if;
  v_caller_rank := public.community_role_rank(p_community, v_me);
  v_target_rank := public.community_role_rank(p_community, p_user);
  if v_caller_rank < 2 then raise exception 'Permission refusée'; end if;
  if v_target_rank = 0 then raise exception 'Membre introuvable'; end if;
  if v_target_rank >= 4 then raise exception 'Le propriétaire ne peut pas être banni'; end if;
  if v_caller_rank <= v_target_rank then raise exception 'Tu ne peux pas bannir ce membre'; end if;
  delete from public.community_members where community_id = p_community and user_id = p_user;
  insert into public.server_bans (community_id, user_id, banned_by, reason, expires_at)
    values (p_community, p_user, v_me, coalesce(nullif(trim(p_reason), ''), ''), p_expires)
    on conflict (community_id, user_id) do update
      set banned_by = excluded.banned_by, reason = excluded.reason, expires_at = excluded.expires_at, created_at = now();
  insert into public.audit_logs (community_id, actor_id, action, target_type, target_id, details)
    values (p_community, v_me, 'ban', 'user', p_user,
      jsonb_build_object('reason', coalesce(p_reason, ''), 'expires_at', p_expires));
end $$;
grant execute on function public.ban_member(uuid, uuid, text, timestamptz) to authenticated;

-- Débannir
create or replace function public.unban_member(p_community uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if not public.can_moderate(p_community) then raise exception 'Permission refusée'; end if;
  delete from public.server_bans where community_id = p_community and user_id = p_user;
  insert into public.audit_logs (community_id, actor_id, action, target_type, target_id, details)
    values (p_community, v_me, 'unban', 'user', p_user, '{}'::jsonb);
end $$;
grant execute on function public.unban_member(uuid, uuid) to authenticated;

-- Timeout : l'utilisateur ne peut plus écrire dans les salons jusqu'à expiration
create or replace function public.timeout_member(p_community uuid, p_user uuid, p_reason text, p_minutes int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_caller_rank int;
  v_target_rank int;
  v_expires timestamptz;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if p_user = v_me then raise exception 'Tu ne peux pas te mettre en timeout toi-même'; end if;
  if p_minutes is null or p_minutes <= 0 then raise exception 'Durée invalide'; end if;
  v_caller_rank := public.community_role_rank(p_community, v_me);
  v_target_rank := public.community_role_rank(p_community, p_user);
  if v_caller_rank < 2 then raise exception 'Permission refusée'; end if;
  if v_target_rank = 0 then raise exception 'Membre introuvable'; end if;
  if v_target_rank >= 4 then raise exception 'Le propriétaire ne peut pas être mis en timeout'; end if;
  if v_caller_rank <= v_target_rank then raise exception 'Tu ne peux pas mettre ce membre en timeout'; end if;
  v_expires := now() + (p_minutes || ' minutes')::interval;
  delete from public.server_timeouts where community_id = p_community and user_id = p_user;
  insert into public.server_timeouts (community_id, user_id, moderator_id, reason, expires_at)
    values (p_community, p_user, v_me, coalesce(nullif(trim(p_reason), ''), ''), v_expires);
  insert into public.audit_logs (community_id, actor_id, action, target_type, target_id, details)
    values (p_community, v_me, 'timeout', 'user', p_user,
      jsonb_build_object('reason', coalesce(p_reason, ''), 'expires_at', v_expires));
end $$;
grant execute on function public.timeout_member(uuid, uuid, text, int) to authenticated;

-- Résoudre un signalement de communauté (les signalements de MP n'ont pas
-- d'équipe de modération : ils restent enregistrés, voir l'interface)
create or replace function public.resolve_report(p_report uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_community uuid;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if p_status not in ('en_cours', 'resolu', 'rejete') then raise exception 'Statut invalide'; end if;
  select community_id into v_community from public.reports where id = p_report;
  if v_community is null then
    raise exception 'Ce signalement concerne un message privé : aucune équipe de modération plateforme ne le revoit pour le moment';
  end if;
  if not public.can_moderate(v_community) then raise exception 'Permission refusée'; end if;
  update public.reports
    set status = p_status, resolved_by = v_me, resolved_at = now()
    where id = p_report;
  insert into public.audit_logs (community_id, actor_id, action, target_type, target_id, details)
    values (v_community, v_me, 'report_resolved', 'report', p_report,
      jsonb_build_object('status', p_status));
end $$;
grant execute on function public.resolve_report(uuid, text) to authenticated;

-- Journalisation d'une action de modération depuis le client
-- (création/suppression de salon ou catégorie, etc.)
create or replace function public.log_moderation_action(
  p_community uuid, p_action text, p_target_type text, p_target_id uuid, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if not public.can_moderate(p_community) then raise exception 'Permission refusée'; end if;
  insert into public.audit_logs (community_id, actor_id, action, target_type, target_id, details)
    values (p_community, v_me, p_action, coalesce(p_target_type, ''), p_target_id, coalesce(p_details, '{}'::jsonb));
end $$;
grant execute on function public.log_moderation_action(uuid, text, text, uuid, jsonb) to authenticated;

-- --------------------------------------------------------------------------
-- 7. Fonctions existantes reprises avec journalisation + contrôle anti-ban
--    (create or replace : le fichier doit être exécuté APRÈS phase 2).
-- --------------------------------------------------------------------------

-- Rejoindre une communauté publique — refuse si un ban actif existe
create or replace function public.join_community(p_community uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if public.is_banned(p_community, v_me) then raise exception 'Tu es banni de cette communauté'; end if;
  if not exists (select 1 from public.communities where id = p_community and is_public) then
    raise exception 'Communauté privée : utilise un lien d’invitation';
  end if;
  insert into public.community_members (community_id, user_id, role)
    values (p_community, v_me, 'membre')
    on conflict do nothing;
end $$;
grant execute on function public.join_community(uuid) to authenticated;

-- Rejoindre via un code d'invitation — refuse si un ban actif existe
create or replace function public.join_community_via_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_community uuid;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  select community_id into v_community
  from public.community_invites
  where code = v_code
    and (expires_at is null or expires_at > now())
    and (max_uses is null or uses < max_uses);
  if v_community is null then raise exception 'Invitation invalide, expirée ou épuisée'; end if;
  if public.is_banned(v_community, v_me) then raise exception 'Tu es banni de cette communauté'; end if;
  insert into public.community_members (community_id, user_id, role)
    values (v_community, v_me, 'membre')
    on conflict do nothing;
  update public.community_invites set uses = uses + 1 where code = v_code;
  return v_community;
end $$;
grant execute on function public.join_community_via_invite(text) to authenticated;

-- Exclure un membre — journalisé (corps repris de phase 2 + audit)
create or replace function public.kick_member(p_community uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
  v_owner uuid;
  v_rank text[] := array['membre','moderateur','admin','proprietaire'];
  v_caller_rank int;
  v_target_rank int;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if p_user = v_me then raise exception 'Utilise « Quitter » pour partir toi-même'; end if;
  select owner_id into v_owner from public.communities where id = p_community;
  if v_owner is null then raise exception 'Communauté introuvable'; end if;
  if p_user = v_owner then raise exception 'Le propriétaire ne peut pas être exclu'; end if;
  select role into v_caller_role
  from public.community_members where community_id = p_community and user_id = v_me;
  select role into v_target_role
  from public.community_members where community_id = p_community and user_id = p_user;
  if v_caller_role is null or v_target_role is null then raise exception 'Membre introuvable'; end if;
  select array_position(v_rank, v_caller_role) into v_caller_rank;
  select array_position(v_rank, v_target_role) into v_target_rank;
  if v_caller_rank is null or v_caller_rank < 2 then raise exception 'Permission refusée'; end if;
  if v_caller_rank <= v_target_rank then raise exception 'Tu ne peux pas exclure ce membre'; end if;
  delete from public.community_members where community_id = p_community and user_id = p_user;
  insert into public.audit_logs (community_id, actor_id, action, target_type, target_id, details)
    values (p_community, v_me, 'kick', 'user', p_user, '{}'::jsonb);
end $$;
grant execute on function public.kick_member(uuid, uuid) to authenticated;

-- Changer le rôle d'un membre — journalisé (corps repris de phase 2 + audit)
create or replace function public.set_member_role(p_community uuid, p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
  v_owner uuid;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if p_role not in ('admin','moderateur','membre') then raise exception 'Rôle invalide'; end if;
  select owner_id into v_owner from public.communities where id = p_community;
  if v_owner is null then raise exception 'Communauté introuvable'; end if;
  if p_user = v_owner then raise exception 'Le rôle du propriétaire ne peut pas être modifié'; end if;
  select role into v_caller_role
  from public.community_members where community_id = p_community and user_id = v_me;
  if v_caller_role is null then raise exception 'Non membre'; end if;
  select role into v_target_role
  from public.community_members where community_id = p_community and user_id = p_user;
  if v_target_role is null then raise exception 'Membre introuvable'; end if;
  if v_caller_role = 'proprietaire' then
    null;
  elsif v_caller_role = 'admin' then
    if v_target_role not in ('moderateur','membre') then
      raise exception 'Un administrateur ne peut pas modifier un autre administrateur';
    end if;
    if p_role = 'admin' then raise exception 'Seul le propriétaire peut nommer un administrateur'; end if;
  else
    raise exception 'Permission refusée';
  end if;
  update public.community_members
  set role = p_role
  where community_id = p_community and user_id = p_user;
  insert into public.audit_logs (community_id, actor_id, action, target_type, target_id, details)
    values (p_community, v_me, 'role_change', 'user', p_user,
      jsonb_build_object('from', v_target_role, 'to', p_role));
end $$;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

-- Transférer la propriété — journalisé (corps repris de phase 2 + audit)
create or replace function public.transfer_ownership(p_community uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  select owner_id into v_owner from public.communities where id = p_community;
  if v_owner is null then raise exception 'Communauté introuvable'; end if;
  if v_owner <> v_me then raise exception 'Seul le propriétaire peut transférer la communauté'; end if;
  if p_new_owner = v_me then raise exception 'Tu es déjà propriétaire'; end if;
  if not exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = p_new_owner
  ) then raise exception 'Le nouveau propriétaire doit être membre'; end if;
  update public.communities set owner_id = p_new_owner where id = p_community;
  update public.community_members set role = 'proprietaire'
  where community_id = p_community and user_id = p_new_owner;
  update public.community_members set role = 'admin'
  where community_id = p_community and user_id = v_me;
  insert into public.audit_logs (community_id, actor_id, action, target_type, target_id, details)
    values (p_community, v_me, 'transfer_ownership', 'user', p_new_owner, '{}'::jsonb);
end $$;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 8. Temps réel — ajout explicite à la publication (idempotent)
-- --------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'server_bans', 'server_timeouts', 'reports', 'audit_logs'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
