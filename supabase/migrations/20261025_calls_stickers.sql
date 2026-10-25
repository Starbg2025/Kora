-- ============================================================================
-- Kora — Appels 1:1 (journal) + Autocollants de serveur
-- Idempotent : ré-exécutable sans doublon.
-- Dépendances : helpers is_dm_member (20261023_rls_recursion_fix.sql),
-- is_community_member / can_moderate (20261024_phase2_communities.sql).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Journal des appels 1:1 (DMs uniquement)
--    Inséré par l'appelant à la fin de l'appel (ou par l'appelé si l'appelant
--    n'a pas pu journaliser, avec déduplication sur started_at).
-- --------------------------------------------------------------------------
create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  dm_id uuid not null references public.dms(id) on delete cascade,
  caller_id uuid not null,
  callee_id uuid not null,
  kind text not null check (kind in ('audio', 'video')),
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('termine', 'manque', 'refuse')),
  created_at timestamptz not null default now()
);
create index if not exists call_logs_dm_idx on public.call_logs (dm_id, started_at desc);
alter table public.call_logs enable row level security;

drop policy if exists call_logs_select on public.call_logs;
create policy call_logs_select on public.call_logs
  for select to authenticated
  using (public.is_dm_member(dm_id));

drop policy if exists call_logs_insert on public.call_logs;
create policy call_logs_insert on public.call_logs
  for insert to authenticated
  with check ((caller_id = auth.uid() or callee_id = auth.uid()) and public.is_dm_member(dm_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_logs'
  ) then
    alter publication supabase_realtime add table public.call_logs;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 2. Autocollants personnalisés de serveur
--    image_path : chemin dans le bucket Storage privé « stickers »,
--    format {community_id}/{uuid}_{nom}. La suppression d'un autocollant ne
--    casse pas les anciens messages : l'envoi COPIE le fichier dans le
--    bucket « pieces-jointes » (pièce jointe normale du message).
-- --------------------------------------------------------------------------
create table if not exists public.custom_stickers (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  image_path text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (community_id, name)
);
create index if not exists custom_stickers_community_idx on public.custom_stickers (community_id, created_at);
alter table public.custom_stickers enable row level security;

drop policy if exists custom_stickers_select on public.custom_stickers;
create policy custom_stickers_select on public.custom_stickers
  for select to authenticated
  using (public.is_community_member(community_id));

drop policy if exists custom_stickers_insert on public.custom_stickers;
create policy custom_stickers_insert on public.custom_stickers
  for insert to authenticated
  with check (public.can_moderate(community_id) and created_by = auth.uid());

drop policy if exists custom_stickers_update on public.custom_stickers;
create policy custom_stickers_update on public.custom_stickers
  for update to authenticated
  using (public.can_moderate(community_id))
  with check (public.can_moderate(community_id));

drop policy if exists custom_stickers_delete on public.custom_stickers;
create policy custom_stickers_delete on public.custom_stickers
  for delete to authenticated
  using (public.can_moderate(community_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_stickers'
  ) then
    alter publication supabase_realtime add table public.custom_stickers;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 3. Bucket Storage « stickers » (privé, URL signées comme pieces-jointes)
--    Lecture : membre de la communauté propriétaire de l'autocollant.
--    Écriture/suppression : modérateur ou plus de la communauté (1er segment
--    du chemin = community_id).
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('stickers', 'stickers', false)
on conflict (id) do nothing;

drop policy if exists stickers_read on storage.objects;
create policy stickers_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'stickers'
    and exists (
      select 1 from public.custom_stickers s
      where s.image_path = name and public.is_community_member(s.community_id)
    )
  );

drop policy if exists stickers_write on storage.objects;
create policy stickers_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'stickers'
    and public.can_moderate((split_part(name, '/', 1))::uuid)
  );

drop policy if exists stickers_update on storage.objects;
create policy stickers_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'stickers'
    and public.can_moderate((split_part(name, '/', 1))::uuid)
  )
  with check (
    bucket_id = 'stickers'
    and public.can_moderate((split_part(name, '/', 1))::uuid)
  );

drop policy if exists stickers_delete on storage.objects;
create policy stickers_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'stickers'
    and public.can_moderate((split_part(name, '/', 1))::uuid)
  );
