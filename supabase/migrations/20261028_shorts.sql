-- ============================================================================
-- KORA — Shorts (20261028)
-- Tables : shorts, short_likes, short_comments, short_views + bucket 'shorts'.
-- Idempotent, non destructif. Ré-exécutable sans danger.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Stockage : bucket public 'shorts'
--    Chemins : <author_id>/<uuid>.<ext> et <author_id>/thumb-<uuid>.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('shorts', 'shorts', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists shorts_read on storage.objects;
create policy shorts_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'shorts');

drop policy if exists shorts_write on storage.objects;
create policy shorts_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'shorts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Suppression : auteur seul, ou auteur + admin du site si la fonction existe.
drop policy if exists shorts_delete on storage.objects;
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_site_admin'
  ) then
    execute $q$
      create policy shorts_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'shorts'
        and ((storage.foldername(name))[1] = auth.uid()::text or public.is_site_admin())
      )
    $q$;
  else
    execute $q$
      create policy shorts_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'shorts'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
    $q$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.shorts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  video_url text not null,
  video_path text not null default '',
  thumbnail_url text,
  thumbnail_path text,
  caption text not null default '' check (char_length(caption) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists shorts_author_created on public.shorts (author_id, created_at desc);
create index if not exists shorts_created on public.shorts (created_at desc);

create table if not exists public.short_likes (
  short_id uuid not null references public.shorts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (short_id, user_id)
);
create index if not exists short_likes_short on public.short_likes (short_id);

create table if not exists public.short_comments (
  id uuid primary key default gen_random_uuid(),
  short_id uuid not null references public.shorts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists short_comments_short on public.short_comments (short_id, created_at asc);

create table if not exists public.short_views (
  short_id uuid not null references public.shorts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (short_id, user_id)
);
create index if not exists short_views_short on public.short_views (short_id);

alter table public.shorts enable row level security;
alter table public.short_likes enable row level security;
alter table public.short_comments enable row level security;
alter table public.short_views enable row level security;

-- ---------------------------------------------------------------------------
-- 3. RLS — fil public en lecture pour les authentifiés, écriture par l'auteur
-- ---------------------------------------------------------------------------
drop policy if exists shorts_select on public.shorts;
create policy shorts_select on public.shorts
  for select to authenticated using (true);

drop policy if exists shorts_insert on public.shorts;
create policy shorts_insert on public.shorts
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists shorts_delete_own on public.shorts;
create policy shorts_delete_own on public.shorts
  for delete to authenticated using (author_id = auth.uid());

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_site_admin'
  ) then
    execute $q$
      create policy shorts_delete_admin on public.shorts
      for delete to authenticated using (public.is_site_admin())
    $q$;
  end if;
end $$;

drop policy if exists short_likes_select on public.short_likes;
create policy short_likes_select on public.short_likes
  for select to authenticated using (true);

drop policy if exists short_likes_insert on public.short_likes;
create policy short_likes_insert on public.short_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists short_likes_delete on public.short_likes;
create policy short_likes_delete on public.short_likes
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists short_comments_select on public.short_comments;
create policy short_comments_select on public.short_comments
  for select to authenticated using (true);

drop policy if exists short_comments_insert on public.short_comments;
create policy short_comments_insert on public.short_comments
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists short_comments_delete on public.short_comments;
create policy short_comments_delete on public.short_comments
  for delete to authenticated using (author_id = auth.uid());

drop policy if exists short_views_select on public.short_views;
create policy short_views_select on public.short_views
  for select to authenticated using (true);

drop policy if exists short_views_insert on public.short_views;
create policy short_views_insert on public.short_views
  for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Temps réel : nouvelles tables dans la publication
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['shorts', 'short_likes', 'short_comments', 'short_views'] loop
    if to_regclass('public.' || t) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
      execute 'alter publication supabase_realtime add table public.' || t;
    end if;
  end loop;
end $$;
