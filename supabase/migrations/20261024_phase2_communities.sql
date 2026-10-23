-- ============================================================================
-- KORA — PHASE 2 : Communautés (serveurs), salons textuels, catégories, rôles
-- Tables : communities, community_members, channel_categories, channels,
--          community_messages, community_message_reactions,
--          community_message_pins, community_invites.
-- RÈGLE D'OR : aucune policy ne sous-interroge sa propre table (récursion
-- infinie 42P17). On utilise des helpers SECURITY DEFINER qui contournent
-- la RLS en interne (motif is_dm_member).
-- À exécuter dans l'éditeur SQL Supabase (ré-exécutable sans risque).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  description text not null default '',
  icon_url text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invite_code text not null unique,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'membre'
    check (role in ('proprietaire','admin','moderateur','membre')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index if not exists community_members_user on public.community_members (user_id);

create table if not exists public.channel_categories (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists channel_categories_community on public.channel_categories (community_id, position);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  category_id uuid references public.channel_categories(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 40),
  topic text not null default '',
  type text not null default 'text' check (type = 'text'),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists channels_community on public.channels (community_id, position);

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  attachment_path text,
  attachment_name text,
  reply_to uuid references public.community_messages(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  check (content <> '' or attachment_path is not null)
);
create index if not exists community_messages_channel on public.community_messages (channel_id, created_at);

create table if not exists public.community_message_reactions (
  message_id uuid not null references public.community_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.community_message_pins (
  message_id uuid primary key references public.community_messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id),
  pinned_at timestamptz not null default now()
);

create table if not exists public.community_invites (
  code text primary key,
  community_id uuid not null references public.communities(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_invites_community on public.community_invites (community_id);

alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.channel_categories enable row level security;
alter table public.channels enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_message_reactions enable row level security;
alter table public.community_message_pins enable row level security;
alter table public.community_invites enable row level security;

-- --------------------------------------------------------------------------
-- 2. Helpers SECURITY DEFINER (aucune récursion possible)
-- --------------------------------------------------------------------------
create or replace function public.is_community_member(p_community uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = auth.uid()
  );
$$;

create or replace function public.community_role(p_community uuid)
returns text
language sql security definer set search_path = public stable
as $$
  select role from public.community_members
  where community_id = p_community and user_id = auth.uid();
$$;

create or replace function public.can_moderate(p_community uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select public.community_role(p_community) in ('proprietaire','admin','moderateur');
$$;

create or replace function public.is_channel_member(p_channel uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.channels c
    join public.community_members m on m.community_id = c.community_id
    where c.id = p_channel and m.user_id = auth.uid()
  );
$$;

-- --------------------------------------------------------------------------
-- 3. RLS — communities
-- --------------------------------------------------------------------------
drop policy if exists communities_select on public.communities;
create policy communities_select on public.communities
  for select to authenticated
  using (is_public or public.is_community_member(id));

drop policy if exists communities_insert on public.communities;
create policy communities_insert on public.communities
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists communities_update on public.communities;
create policy communities_update on public.communities
  for update to authenticated
  using (public.community_role(id) in ('proprietaire','admin'))
  with check (public.community_role(id) in ('proprietaire','admin'));

drop policy if exists communities_delete on public.communities;
create policy communities_delete on public.communities
  for delete to authenticated
  using (public.community_role(id) = 'proprietaire');

-- --------------------------------------------------------------------------
-- 4. RLS — community_members
-- --------------------------------------------------------------------------
drop policy if exists community_members_select on public.community_members;
create policy community_members_select on public.community_members
  for select to authenticated
  using (public.is_community_member(community_id));

drop policy if exists community_members_insert on public.community_members;
create policy community_members_insert on public.community_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.is_community_member(community_id)
      or exists (select 1 from public.communities c where c.id = community_members.community_id and c.is_public)
    )
  );

drop policy if exists community_members_update on public.community_members;
create policy community_members_update on public.community_members
  for update to authenticated
  using (public.community_role(community_id) in ('proprietaire','admin'))
  with check (public.community_role(community_id) in ('proprietaire','admin'));

drop policy if exists community_members_delete on public.community_members;
create policy community_members_delete on public.community_members
  for delete to authenticated
  using (user_id = auth.uid() or public.can_moderate(community_id));

-- --------------------------------------------------------------------------
-- 5. RLS — channel_categories
-- --------------------------------------------------------------------------
drop policy if exists channel_categories_select on public.channel_categories;
create policy channel_categories_select on public.channel_categories
  for select to authenticated
  using (public.is_community_member(community_id));

drop policy if exists channel_categories_write on public.channel_categories;
create policy channel_categories_write on public.channel_categories
  for all to authenticated
  using (public.community_role(community_id) in ('proprietaire','admin'))
  with check (public.community_role(community_id) in ('proprietaire','admin'));

-- --------------------------------------------------------------------------
-- 6. RLS — channels
-- --------------------------------------------------------------------------
drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
  for select to authenticated
  using (public.is_community_member(community_id));

drop policy if exists channels_write on public.channels;
create policy channels_write on public.channels
  for all to authenticated
  using (public.community_role(community_id) in ('proprietaire','admin'))
  with check (public.community_role(community_id) in ('proprietaire','admin'));

-- --------------------------------------------------------------------------
-- 7. RLS — community_messages
-- --------------------------------------------------------------------------
drop policy if exists community_messages_select on public.community_messages;
create policy community_messages_select on public.community_messages
  for select to authenticated
  using (public.is_channel_member(channel_id));

drop policy if exists community_messages_insert on public.community_messages;
create policy community_messages_insert on public.community_messages
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_channel_member(channel_id));

drop policy if exists community_messages_update on public.community_messages;
create policy community_messages_update on public.community_messages
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists community_messages_delete on public.community_messages;
create policy community_messages_delete on public.community_messages
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.channels c
      where c.id = community_messages.channel_id
        and public.can_moderate(c.community_id)
    )
  );

-- --------------------------------------------------------------------------
-- 8. RLS — community_message_reactions
-- --------------------------------------------------------------------------
drop policy if exists community_reactions_select on public.community_message_reactions;
create policy community_reactions_select on public.community_message_reactions
  for select to authenticated
  using (exists (
    select 1 from public.community_messages msg
    where msg.id = community_message_reactions.message_id
      and public.is_channel_member(msg.channel_id)
  ));

drop policy if exists community_reactions_insert on public.community_message_reactions;
create policy community_reactions_insert on public.community_message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.community_messages msg
      where msg.id = community_message_reactions.message_id
        and public.is_channel_member(msg.channel_id)
    )
  );

drop policy if exists community_reactions_delete on public.community_message_reactions;
create policy community_reactions_delete on public.community_message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- 9. RLS — community_message_pins (modération uniquement)
-- --------------------------------------------------------------------------
drop policy if exists community_pins_select on public.community_message_pins;
create policy community_pins_select on public.community_message_pins
  for select to authenticated
  using (exists (
    select 1 from public.community_messages msg
    where msg.id = community_message_pins.message_id
      and public.is_channel_member(msg.channel_id)
  ));

drop policy if exists community_pins_write on public.community_message_pins;
create policy community_pins_write on public.community_message_pins
  for all to authenticated
  using (exists (
    select 1 from public.community_messages msg
    join public.channels c on c.id = msg.channel_id
    where msg.id = community_message_pins.message_id
      and public.can_moderate(c.community_id)
  ))
  with check (exists (
    select 1 from public.community_messages msg
    join public.channels c on c.id = msg.channel_id
    where msg.id = community_message_pins.message_id
      and public.can_moderate(c.community_id)
  ));

-- --------------------------------------------------------------------------
-- 10. RLS — community_invites
-- --------------------------------------------------------------------------
drop policy if exists community_invites_select on public.community_invites;
create policy community_invites_select on public.community_invites
  for select to authenticated
  using (public.is_community_member(community_id));

drop policy if exists community_invites_insert on public.community_invites;
create policy community_invites_insert on public.community_invites
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_community_member(community_id));

drop policy if exists community_invites_delete on public.community_invites;
create policy community_invites_delete on public.community_invites
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.community_role(community_id) in ('proprietaire','admin')
  );

-- --------------------------------------------------------------------------
-- 11. Stockage pièces-jointes : autoriser aussi les salons de communautés
--     (dossier = channel_id). Les règles DM existantes sont conservées.
-- --------------------------------------------------------------------------
drop policy if exists pj_read on storage.objects;
create policy pj_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pieces-jointes'
    and (
      (storage.foldername(name))[1] in (
        select id::text from public.dms where public.is_dm_member(id)
      )
      or (storage.foldername(name))[1] in (
        select id::text from public.channels where public.is_channel_member(id)
      )
    )
  );

drop policy if exists pj_write on storage.objects;
create policy pj_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pieces-jointes'
    and (
      (storage.foldername(name))[1] in (
        select id::text from public.dms where public.is_dm_member(id)
      )
      or (storage.foldername(name))[1] in (
        select id::text from public.channels where public.is_channel_member(id)
      )
    )
  );

drop policy if exists pj_delete on storage.objects;
create policy pj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pieces-jointes'
    and (
      (storage.foldername(name))[1] in (
        select id::text from public.dms where public.is_dm_member(id)
      )
      or (storage.foldername(name))[1] in (
        select id::text from public.channels where public.is_channel_member(id)
      )
    )
  );

-- --------------------------------------------------------------------------
-- 12. Fonctions métier (SECURITY DEFINER)
-- --------------------------------------------------------------------------

-- Création d'une communauté : communauté + propriétaire + catégorie + salon général
create or replace function public.create_community(p_name text, p_description text default '')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_community uuid;
  v_code text;
  v_cat uuid;
  v_clean_name text := trim(p_name);
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if v_clean_name is null or char_length(v_clean_name) < 2 then
    raise exception 'Le nom doit contenir au moins 2 caractères';
  end if;
  if not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'Profil introuvable';
  end if;
  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (select 1 from public.communities where invite_code = v_code);
  end loop;
  insert into public.communities (name, description, owner_id, invite_code)
    values (v_clean_name, coalesce(nullif(trim(p_description), ''), ''), v_me, v_code)
    returning id into v_community;
  insert into public.community_members (community_id, user_id, role)
    values (v_community, v_me, 'proprietaire');
  insert into public.channel_categories (community_id, name, position)
    values (v_community, 'Salons textuels', 0)
    returning id into v_cat;
  insert into public.channels (community_id, category_id, name, topic, position)
    values (v_community, v_cat, 'général', 'Discussions générales', 0);
  return v_community;
end $$;
grant execute on function public.create_community(text, text) to authenticated;

-- Rejoindre une communauté publique
create or replace function public.join_community(p_community uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if not exists (select 1 from public.communities where id = p_community and is_public) then
    raise exception 'Communauté privée : utilise un lien d’invitation';
  end if;
  insert into public.community_members (community_id, user_id, role)
    values (p_community, v_me, 'membre')
    on conflict do nothing;
end $$;
grant execute on function public.join_community(uuid) to authenticated;

-- Rejoindre via un code d'invitation (valide : existant, non expiré, non épuisé)
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
  insert into public.community_members (community_id, user_id, role)
    values (v_community, v_me, 'membre')
    on conflict do nothing;
  update public.community_invites set uses = uses + 1 where code = v_code;
  return v_community;
end $$;
grant execute on function public.join_community_via_invite(text) to authenticated;

-- Infos publiques d'une invitation (pour la page /invitation/:code, même déconnecté)
create or replace function public.get_invite_info(p_code text)
returns table (
  community_id uuid,
  name text,
  icon_url text,
  description text,
  member_count bigint
)
language sql security definer set search_path = public stable
as $$
  select c.id, c.name, c.icon_url, c.description,
         (select count(*) from public.community_members m where m.community_id = c.id)
  from public.communities c
  join public.community_invites i on i.community_id = c.id
  where i.code = upper(trim(p_code))
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses is null or i.uses < i.max_uses);
$$;
grant execute on function public.get_invite_info(text) to authenticated, anon;

-- Découverte des communautés publiques (compteurs exacts, sans contournement RLS côté client)
create or replace function public.discover_communities(p_query text default '')
returns table (
  id uuid,
  name text,
  description text,
  icon_url text,
  member_count bigint,
  already_member boolean
)
language sql security definer set search_path = public stable
as $$
  select c.id, c.name, c.description, c.icon_url,
         (select count(*) from public.community_members m where m.community_id = c.id),
         public.is_community_member(c.id)
  from public.communities c
  where c.is_public
    and (
      p_query = ''
      or c.name ilike '%' || p_query || '%'
      or c.description ilike '%' || p_query || '%'
    )
  order by c.created_at desc
  limit 100;
$$;
grant execute on function public.discover_communities(text) to authenticated;

-- Changer le rôle d'un membre (règles de rang strictes)
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
    null; -- le propriétaire peut tout faire (sauf se rétrograder ici)
  elsif v_caller_role = 'admin' then
    if v_target_role not in ('moderateur','membre') then
      raise exception 'Un administrateur ne peut pas modifier un autre administrateur';
    end if;
    -- p_role déjà restreint à admin/moderateur/membre par le check ci-dessus,
    -- mais un admin ne peut pas créer d'admin :
    if p_role = 'admin' then raise exception 'Seul le propriétaire peut nommer un administrateur'; end if;
  else
    raise exception 'Permission refusée';
  end if;
  update public.community_members
  set role = p_role
  where community_id = p_community and user_id = p_user;
end $$;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

-- Exclure un membre (le rang de l'excluant doit être strictement supérieur)
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
end $$;
grant execute on function public.kick_member(uuid, uuid) to authenticated;

-- Transférer la propriété (propriétaire uniquement)
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
end $$;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 13. Temps réel — ajout explicite à la publication (idempotent)
-- --------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'communities','community_members','channel_categories','channels',
    'community_messages','community_message_reactions','community_message_pins'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
