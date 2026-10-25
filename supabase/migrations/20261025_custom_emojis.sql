-- Kora — Émojis personnalisés de serveur (20261025, façon Yapper)
-- Upload par serveur (PNG, JPG, WebP ou GIF animé, 1 Mo max), utilisables
-- partout avec :nom: dans les DMs et les salons. La suppression d'un émoji
-- ne casse jamais les anciens messages : l'affichage résout :nom: vers
-- l'image, et un nom inconnu s'affiche tel quel en texte.
-- Ré-exécutable sans danger.

-- ---------------------------------------------------------------------------
-- 1. Helper : l'utilisateur courant est-il propriétaire ou admin ?
-- (SECURITY DEFINER, comme is_community_member : aucune récursion RLS.)
-- ---------------------------------------------------------------------------
create or replace function public.is_community_manager(p_community uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.community_members
    where community_id = p_community
      and user_id = auth.uid()
      and role in ('proprietaire', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Bucket public « emojis » (les images s'affichent dans le chat, y
-- compris dans les anciens messages : pas d'URL signée à expiration).
-- Chemin : {community_id}/{uuid}.{ext}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('emojis', 'emojis', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists emojis_read on storage.objects;
create policy emojis_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'emojis');

drop policy if exists emojis_write on storage.objects;
create policy emojis_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'emojis'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_community_manager((storage.foldername(name))[1]::uuid)
  );

drop policy if exists emojis_update on storage.objects;
create policy emojis_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'emojis'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_community_manager((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'emojis'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_community_manager((storage.foldername(name))[1]::uuid)
  );

drop policy if exists emojis_delete on storage.objects;
create policy emojis_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'emojis'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_community_manager((storage.foldername(name))[1]::uuid)
  );

-- ---------------------------------------------------------------------------
-- 3. Table custom_emojis
-- ---------------------------------------------------------------------------
create table if not exists public.custom_emojis (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  image_path text not null,
  animated boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint custom_emojis_name_unique unique (community_id, name),
  constraint custom_emojis_name_format check (name ~ '^[a-z0-9_-]{2,32}$')
);

alter table public.custom_emojis enable row level security;

-- Lecture : les membres de la communauté (le sélecteur ne montre que les
-- émojis des communautés de l'utilisateur, mais la lecture reste bornée).
drop policy if exists custom_emojis_select on public.custom_emojis;
create policy custom_emojis_select on public.custom_emojis
  for select to authenticated using (public.is_community_member(community_id));

-- Écriture : propriétaire ou admin uniquement (le client normalise le nom).
drop policy if exists custom_emojis_write on public.custom_emojis;
create policy custom_emojis_write on public.custom_emojis
  for all to authenticated
  using (public.is_community_manager(community_id))
  with check (public.is_community_manager(community_id));

-- ---------------------------------------------------------------------------
-- 4. Publication temps réel
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.custom_emojis') is not null
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'custom_emojis'
    ) then
    execute 'alter publication supabase_realtime add table public.custom_emojis';
  end if;
end $$;
