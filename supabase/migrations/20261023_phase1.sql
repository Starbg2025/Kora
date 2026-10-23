-- ============================================================================
-- KORA — Phase 1 : schéma complet + RLS strictes
-- Tables : profiles, user_settings, friendships, dms, dm_members, messages
-- Buckets Storage : avatars (public), pieces-jointes (privé, membres du DM)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0. Nettoyage idempotent (ré-exécutable sans tout casser)
-- --------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.username_available(text);
drop function if exists public.can_receive_friend_request(uuid);
drop function if exists public.create_direct_dm(uuid);

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------

-- Profils publics (AUCUN email ici : il reste dans auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  status text not null default 'en_ligne'
    check (status in ('en_ligne','inactif','ne_pas_deranger','invisible')),
  custom_status text not null default '',
  custom_status_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_ci on public.profiles (lower(username));

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'systeme' check (theme in ('clair','sombre','systeme')),
  density text not null default 'confortable' check (density in ('confortable','compacte')),
  dm_mute text[] not null default '{}',
  friend_requests_open boolean not null default true
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- Unicité de la paire quelle que soit la direction
create unique index if not exists friendships_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table if not exists public.dms (
  id uuid primary key default gen_random_uuid(),
  name text,
  is_group boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  dm_key text -- renseigné uniquement pour les DM 1:1 (paire triée), NULL pour les groupes
);
create unique index if not exists dms_dm_key on public.dms (dm_key) where dm_key is not null;

create table if not exists public.dm_members (
  dm_id uuid not null references public.dms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (dm_id, user_id)
);
create index if not exists dm_members_user on public.dm_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  dm_id uuid not null references public.dms(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  attachment_path text,   -- chemin dans le bucket pieces-jointes : {dm_id}/{uuid}_{nom}
  attachment_name text,
  edited_at timestamptz,
  reply_to uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  check (content <> '' or attachment_path is not null)
);
create index if not exists messages_dm_created on public.messages (dm_id, created_at);
create index if not exists messages_author on public.messages (author_id);

-- --------------------------------------------------------------------------
-- 2. Fonctions SECURITY DEFINER (contournent la RLS de façon contrôlée)
-- --------------------------------------------------------------------------

-- Disponibilité d'un nom d'utilisateur (insensible à la casse). Appelable en anonyme
-- pour la vérification pendant l'inscription.
create function public.username_available(p_username text)
returns boolean
language sql security definer set search_path = public
as $$ select not exists (select 1 from public.profiles where lower(username) = lower(p_username)) $$;
grant execute on function public.username_available(text) to anon, authenticated;

-- Le destinataire accepte-t-il les demandes d'ami ?
create function public.can_receive_friend_request(p_user uuid)
returns boolean
language sql security definer set search_path = public
as $$ select coalesce((select friend_requests_open from public.user_settings where user_id = p_user), true) $$;
grant execute on function public.can_receive_friend_request(uuid) to authenticated;

-- Création/récupération du DM 1:1 avec un ami (sécurisé : amis acceptés uniquement)
create function public.create_direct_dm(p_other uuid)
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

-- Création automatique du profil + réglages à l'inscription
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_base text;
  v_username text;
  v_try int := 0;
begin
  v_base := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), 'utilisateur');
  v_base := regexp_replace(lower(v_base), '[^a-z0-9_.-]', '', 'g');
  if v_base = '' then v_base := 'utilisateur'; end if;
  v_username := v_base;
  while exists (select 1 from public.profiles where lower(username) = lower(v_username)) loop
    v_try := v_try + 1;
    v_username := v_base || '_' || substr(md5(new.id::text || v_try::text), 1, 4);
  end loop;
  insert into public.profiles (id, username, display_name)
    values (new.id, v_username, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), v_username));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------------
-- 3. RLS — activation
-- --------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.friendships enable row level security;
alter table public.dms enable row level security;
alter table public.dm_members enable row level security;
alter table public.messages enable row level security;

-- --------------------------------------------------------------------------
-- 4. RLS — profiles
-- Les champs sont publics par conception (pseudo, avatar, bio, statut) :
-- la recherche d'amis par nom d'utilisateur l'exige. AUCUN email dans cette table.
-- --------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
-- Pas de INSERT/DELETE côté client : seul le trigger handle_new_user écrit.

-- --------------------------------------------------------------------------
-- 5. RLS — user_settings (strictement personnel)
-- --------------------------------------------------------------------------
drop policy if exists user_settings_all on public.user_settings;
create policy user_settings_all on public.user_settings
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --------------------------------------------------------------------------
-- 6. RLS — friendships
-- --------------------------------------------------------------------------
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    auth.uid() = requester_id
    and (status = 'blocked' or public.can_receive_friend_request(addressee_id))
  );

drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- --------------------------------------------------------------------------
-- 7. RLS — dms / dm_members
-- --------------------------------------------------------------------------
drop policy if exists dms_select on public.dms;
create policy dms_select on public.dms
  for select to authenticated
  using (exists (select 1 from public.dm_members m where m.dm_id = dms.id and m.user_id = auth.uid()));

drop policy if exists dms_insert on public.dms;
create policy dms_insert on public.dms
  for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists dms_update on public.dms;
create policy dms_update on public.dms
  for update to authenticated
  using (exists (select 1 from public.dm_members m where m.dm_id = dms.id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.dm_members m where m.dm_id = dms.id and m.user_id = auth.uid()));

drop policy if exists dms_delete on public.dms;
create policy dms_delete on public.dms
  for delete to authenticated
  using (auth.uid() = created_by and is_group);

drop policy if exists dm_members_select on public.dm_members;
create policy dm_members_select on public.dm_members
  for select to authenticated
  using (exists (select 1 from public.dm_members m where m.dm_id = dm_members.dm_id and m.user_id = auth.uid()));

drop policy if exists dm_members_insert on public.dm_members;
create policy dm_members_insert on public.dm_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.dm_members m where m.dm_id = dm_members.dm_id and m.user_id = auth.uid())
  );

drop policy if exists dm_members_update on public.dm_members;
create policy dm_members_update on public.dm_members
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists dm_members_delete on public.dm_members;
create policy dm_members_delete on public.dm_members
  for delete to authenticated
  using (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- 8. RLS — messages
-- --------------------------------------------------------------------------
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (exists (select 1 from public.dm_members m where m.dm_id = messages.dm_id and m.user_id = auth.uid()));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (select 1 from public.dm_members m where m.dm_id = messages.dm_id and m.user_id = auth.uid())
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated
  using (auth.uid() = author_id);

-- --------------------------------------------------------------------------
-- 9. Storage : buckets + policies
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('pieces-jointes', 'pieces-jointes', false)
on conflict (id) do update set public = excluded.public;

-- Avatars : lecture publique, écriture restreinte à son propre dossier {user_id}/
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Pièces jointes : chemin {dm_id}/{fichier} — seuls les membres du DM y accèdent
drop policy if exists pj_read on storage.objects;
create policy pj_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pieces-jointes'
    and (storage.foldername(name))[1] in (
      select dm_id::text from public.dm_members where user_id = auth.uid()
    )
  );

drop policy if exists pj_write on storage.objects;
create policy pj_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pieces-jointes'
    and (storage.foldername(name))[1] in (
      select dm_id::text from public.dm_members where user_id = auth.uid()
    )
  );

drop policy if exists pj_delete on storage.objects;
create policy pj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pieces-jointes'
    and (storage.foldername(name))[1] in (
      select dm_id::text from public.dm_members where user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- 10. Realtime : publier les tables modifiées en direct
-- --------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_members'
  ) then
    alter publication supabase_realtime add table public.dm_members;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- Identité complète pour les UPDATE temps réel (statuts, last_read_at…)
alter table public.messages replica identity full;
alter table public.profiles replica identity full;
alter table public.dm_members replica identity full;
alter table public.friendships replica identity full;
