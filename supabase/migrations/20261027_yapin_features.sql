-- Kora — Fonctionnalités « façon Yapin' » (20261027)
-- Profils et décorations, mentions, dossiers et thèmes de serveurs,
-- slowmode, onboarding, webhooks et bots. Idempotent, non destructif.
-- Inspiré de CONCEPTS observés chez Yapin' — aucun élément de marque tiers.
-- Dépend de la phase 2 (is_community_member, community_role) déjà exécutée.
-- Ne dépend d'AUCUNE des migrations en attente (moderation, custom_emojis,
-- profile_media, privacy_social) : chaque objet ci-dessous est autonome.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Profils : décoration d'avatar, thème de profil, pronoms
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_frame text not null default 'none';
alter table public.profiles add column if not exists profile_theme text;
alter table public.profiles add column if not exists pronouns text not null default '';

-- ---------------------------------------------------------------------------
-- 2. Réservation du nom d'utilisateur (7 jours après un changement)
-- ---------------------------------------------------------------------------
create table if not exists public.username_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  changed_at timestamptz not null default now()
);
alter table public.username_history enable row level security;
drop policy if exists username_history_select on public.username_history;
create policy username_history_select on public.username_history
  for select to authenticated using (user_id = auth.uid());

create or replace function public.reserve_old_username()
returns trigger
language plpgsql
as $$
begin
  if old.username is distinct from new.username then
    insert into public.username_history (user_id, username) values (old.id, old.username);
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_reserve_username on public.profiles;
create trigger profiles_reserve_username
  before update of username on public.profiles
  for each row execute function public.reserve_old_username();

-- Un nom est libre s'il n'est pris par personne ET pas réservé depuis moins
-- de 7 jours par quelqu'un d'autre (le propriétaire peut le reprendre).
create or replace function public.username_available(p_username text)
returns boolean
language sql security definer set search_path = public stable
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username))
     and not exists (
       select 1 from public.username_history
       where lower(username) = lower(p_username)
         and changed_at > now() - interval '7 days'
         and user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     );
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Notes privées sur les profils (auteur seul)
-- ---------------------------------------------------------------------------
create table if not exists public.profile_notes (
  author_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (author_id, target_id)
);
alter table public.profile_notes enable row level security;
drop policy if exists profile_notes_all on public.profile_notes;
create policy profile_notes_all on public.profile_notes
  for all to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Communautés : accent, bannière, tag, onboarding
-- ---------------------------------------------------------------------------
alter table public.communities add column if not exists accent_color text;
alter table public.communities add column if not exists banner_url text;
alter table public.communities add column if not exists tag text;
alter table public.communities add column if not exists onboarding_enabled boolean not null default false;
alter table public.communities add column if not exists onboarding_rules text not null default '';
alter table public.communities add column if not exists onboarding_start_channel_id uuid;

create table if not exists public.community_onboarding_questions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.community_onboarding_questions enable row level security;
drop policy if exists onboarding_q_select on public.community_onboarding_questions;
create policy onboarding_q_select on public.community_onboarding_questions
  for select to authenticated using (public.is_community_member(community_id));
drop policy if exists onboarding_q_write on public.community_onboarding_questions;
create policy onboarding_q_write on public.community_onboarding_questions
  for all to authenticated
  using (public.community_role(community_id) in ('proprietaire', 'admin'))
  with check (public.community_role(community_id) in ('proprietaire', 'admin'));

-- Adhésion avec onboarding : valide l'invitation comme
-- join_community_via_invite, puis attribue le rôle selon les réponses
-- (seul 'moderateur' peut être accordé par questionnaire, jamais
-- admin/propriétaire). p_answers : [{question_id, option}] (option = libellé).
create or replace function public.join_with_onboarding(p_code text, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_community uuid;
  v_role text := 'membre';
  v_start uuid;
  v_q record;
  v_a jsonb;
  v_opt jsonb;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  select community_id into v_community
  from public.community_invites
  where code = v_code
    and (expires_at is null or expires_at > now())
    and (max_uses is null or uses < max_uses);
  if v_community is null then raise exception 'Invitation invalide, expirée ou épuisée'; end if;
  if exists (select 1 from public.community_members where community_id = v_community and user_id = v_me) then
    raise exception 'Tu es déjà membre.';
  end if;
  select onboarding_start_channel_id into v_start from public.communities where id = v_community;
  for v_q in select id, options from public.community_onboarding_questions where community_id = v_community loop
    select value into v_a
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as value
    where (value ->> 'question_id') = v_q.id::text;
    if v_a is not null then
      for v_opt in select * from jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) loop
        if (v_opt ->> 'label') = (v_a ->> 'option') and (v_opt ->> 'role') = 'moderateur' then
          v_role := 'moderateur';
        end if;
      end loop;
    end if;
  end loop;
  insert into public.community_members (community_id, user_id, role)
  values (v_community, v_me, v_role);
  update public.community_invites set uses = uses + 1 where code = v_code;
  return jsonb_build_object('community_id', v_community, 'role', v_role, 'start_channel_id', v_start);
end;
$$;
grant execute on function public.join_with_onboarding(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Salons : slowmode (appliqué CÔTÉ SERVEUR par trigger)
-- ---------------------------------------------------------------------------
alter table public.channels add column if not exists slowmode_seconds integer not null default 0;
alter table public.community_messages add column if not exists via_webhook boolean not null default false;
alter table public.community_messages add column if not exists bot_name text;

create or replace function public.enforce_slowmode()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  s integer;
  last_ts timestamptz;
  wait_s integer;
begin
  select slowmode_seconds into s from public.channels where id = new.channel_id;
  if s is not null and s > 0 then
    select max(created_at) into last_ts
    from public.community_messages
    where channel_id = new.channel_id and author_id = new.author_id;
    if last_ts is not null and last_ts > now() - (s || ' seconds')::interval then
      wait_s := greatest(1, ceil(extract(epoch from (last_ts + (s || ' seconds')::interval - now())))::integer);
      raise exception 'Slowmode : attends encore % seconde(s) avant de renvoyer un message.', wait_s;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists community_messages_slowmode on public.community_messages;
create trigger community_messages_slowmode
  before insert on public.community_messages
  for each row execute function public.enforce_slowmode();

-- ---------------------------------------------------------------------------
-- 6. Dossiers de serveurs (par utilisateur)
-- ---------------------------------------------------------------------------
create table if not exists public.server_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  collapsed boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.server_folder_items (
  folder_id uuid not null references public.server_folders(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  position integer not null default 0,
  primary key (folder_id, community_id)
);
alter table public.server_folders enable row level security;
alter table public.server_folder_items enable row level security;
drop policy if exists server_folders_all on public.server_folders;
create policy server_folders_all on public.server_folders
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists server_folder_items_all on public.server_folder_items;
create policy server_folder_items_all on public.server_folder_items
  for all to authenticated
  using (exists (select 1 from public.server_folders f where f.id = folder_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.server_folders f where f.id = folder_id and f.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. Webhooks et bots (jetons hashés, jamais stockés en clair)
-- ---------------------------------------------------------------------------
create table if not exists public.community_webhooks (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  name text not null,
  token_hash text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  token_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.bot_servers (
  bot_id uuid not null references public.bots(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  added_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bot_id, community_id)
);
-- Journal de débit (écrit uniquement par les RPC, jamais lu directement).
create table if not exists public.post_ledger (
  id bigint generated always as identity primary key,
  source_type text not null,
  source_id uuid not null,
  channel_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.community_webhooks enable row level security;
alter table public.bots enable row level security;
alter table public.bot_servers enable row level security;
alter table public.post_ledger enable row level security;

drop policy if exists community_webhooks_admin on public.community_webhooks;
create policy community_webhooks_admin on public.community_webhooks
  for all to authenticated
  using (exists (select 1 from public.channels ch where ch.id = channel_id and public.community_role(ch.community_id) in ('proprietaire', 'admin')))
  with check (exists (select 1 from public.channels ch where ch.id = channel_id and public.community_role(ch.community_id) in ('proprietaire', 'admin')));
drop policy if exists bots_owner on public.bots;
create policy bots_owner on public.bots
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists bot_servers_select on public.bot_servers;
create policy bot_servers_select on public.bot_servers
  for select to authenticated using (public.is_community_member(community_id));
drop policy if exists bot_servers_write on public.bot_servers;
create policy bot_servers_write on public.bot_servers
  for all to authenticated
  using (
    public.community_role(community_id) in ('proprietaire', 'admin')
    and exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = auth.uid())
  )
  with check (
    public.community_role(community_id) in ('proprietaire', 'admin')
    and exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = auth.uid())
  );

-- Publication par webhook : l'auteur affiché est le créateur du webhook
-- (visible via le fanion via_webhook), débit 30/min par webhook et 60/min
-- par salon. Le jeton est comparé par hash SHA-256 uniquement.
create or replace function public.post_webhook_message(p_token text, p_channel_id uuid, p_content text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_wh record;
  v_count integer;
  v_msg_id uuid;
begin
  if p_content is null or char_length(trim(p_content)) = 0 or char_length(p_content) > 2000 then
    raise exception 'Contenu invalide (1 à 2000 caractères).';
  end if;
  select * into v_wh from public.community_webhooks
  where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then raise exception 'Jeton webhook invalide.'; end if;
  if v_wh.channel_id <> p_channel_id then raise exception 'Ce webhook ne poste pas dans ce salon.'; end if;
  select count(*) into v_count from public.post_ledger
  where source_type = 'webhook' and source_id = v_wh.id and created_at > now() - interval '60 seconds';
  if v_count >= 30 then raise exception 'Limite de débit atteinte (30 messages/minute).'; end if;
  select count(*) into v_count from public.post_ledger
  where channel_id = p_channel_id and created_at > now() - interval '60 seconds';
  if v_count >= 60 then raise exception 'Limite de débit du salon atteinte.'; end if;
  insert into public.community_messages (channel_id, author_id, content, via_webhook)
  values (p_channel_id, v_wh.created_by, trim(p_content), true)
  returning id into v_msg_id;
  insert into public.post_ledger (source_type, source_id, channel_id)
  values ('webhook', v_wh.id, p_channel_id);
  return v_msg_id;
end;
$$;
grant execute on function public.post_webhook_message(text, uuid, text) to anon, authenticated;

-- Publication par bot : le bot doit être ajouté à la communauté du salon.
-- Le message porte le nom du bot (bot_name) et l'auteur technique est le
-- propriétaire du bot.
create or replace function public.post_bot_message(p_token text, p_channel_id uuid, p_content text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_bot record;
  v_comm uuid;
  v_count integer;
  v_msg_id uuid;
begin
  if p_content is null or char_length(trim(p_content)) = 0 or char_length(p_content) > 2000 then
    raise exception 'Contenu invalide (1 à 2000 caractères).';
  end if;
  select * into v_bot from public.bots
  where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then raise exception 'Jeton bot invalide.'; end if;
  select community_id into v_comm from public.channels where id = p_channel_id;
  if v_comm is null then raise exception 'Salon introuvable.'; end if;
  if not exists (select 1 from public.bot_servers where bot_id = v_bot.id and community_id = v_comm) then
    raise exception 'Ce bot n’est pas ajouté à cette communauté.';
  end if;
  select count(*) into v_count from public.post_ledger
  where source_type = 'bot' and source_id = v_bot.id and created_at > now() - interval '60 seconds';
  if v_count >= 30 then raise exception 'Limite de débit atteinte (30 messages/minute).'; end if;
  select count(*) into v_count from public.post_ledger
  where channel_id = p_channel_id and created_at > now() - interval '60 seconds';
  if v_count >= 60 then raise exception 'Limite de débit du salon atteinte.'; end if;
  insert into public.community_messages (channel_id, author_id, content, bot_name)
  values (p_channel_id, v_bot.owner_id, trim(p_content), v_bot.name)
  returning id into v_msg_id;
  insert into public.post_ledger (source_type, source_id, channel_id)
  values ('bot', v_bot.id, p_channel_id);
  return v_msg_id;
end;
$$;
grant execute on function public.post_bot_message(text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Préférences : couleurs du serveur
-- ---------------------------------------------------------------------------
alter table public.user_settings add column if not exists use_server_colors boolean not null default true;

-- ---------------------------------------------------------------------------
-- 9. Stockage : bannières de communauté (écriture réservée aux admins)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('community-banners', 'community-banners', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists community_banners_read on storage.objects;
create policy community_banners_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'community-banners');

drop policy if exists community_banners_write on storage.objects;
create policy community_banners_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-banners'
    and public.community_role((storage.foldername(name))[1]::uuid) in ('proprietaire', 'admin')
  );

drop policy if exists community_banners_update on storage.objects;
create policy community_banners_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'community-banners'
    and public.community_role((storage.foldername(name))[1]::uuid) in ('proprietaire', 'admin')
  )
  with check (
    bucket_id = 'community-banners'
    and public.community_role((storage.foldername(name))[1]::uuid) in ('proprietaire', 'admin')
  );

drop policy if exists community_banners_delete on storage.objects;
create policy community_banners_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-banners'
    and public.community_role((storage.foldername(name))[1]::uuid) in ('proprietaire', 'admin')
  );

-- ---------------------------------------------------------------------------
-- 10. Temps réel : nouvelles tables
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['server_folders', 'server_folder_items', 'profile_notes', 'community_onboarding_questions', 'community_webhooks', 'bots', 'bot_servers'] loop
    if to_regclass('public.' || t) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
      execute 'alter publication supabase_realtime add table public.' || t;
    end if;
  end loop;
end $$;
