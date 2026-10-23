-- ============================================================================
-- KORA — CORRECTIF CRITIQUE RLS : récursion infinie sur dm_members
-- Symptôme : « infinite recursion detected in policy for relation "dm_members" »
-- (code 42P17). TOUT ce qui touche aux discussions échouait : liste des
-- discussions, ouverture (« Conversation introuvable »), envoi de messages,
-- pièces jointes, réactions, épinglés, sondages.
-- Cause : les policies interrogeaient dm_members dans leur propre définition.
-- Solution : fonction SECURITY DEFINER is_dm_member() qui contourne la RLS
-- (motif canonique Supabase, aucune récursion possible).
-- À exécuter dans l'éditeur SQL Supabase (ré-exécutable sans risque).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Fonction helper — SECURITY DEFINER : pas de RLS à l'intérieur, donc
--    aucune récursion. auth.uid() reste celui de l'appelant.
-- --------------------------------------------------------------------------
create or replace function public.is_dm_member(p_dm uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.dm_members
    where dm_id = p_dm and user_id = auth.uid()
  );
$$;

-- --------------------------------------------------------------------------
-- 2. dm_members
-- --------------------------------------------------------------------------
drop policy if exists dm_members_select on public.dm_members;
create policy dm_members_select on public.dm_members
  for select to authenticated
  using (public.is_dm_member(dm_id));

drop policy if exists dm_members_insert on public.dm_members;
create policy dm_members_insert on public.dm_members
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_dm_member(dm_id));

-- dm_members_update / dm_members_delete : déjà sans récursion (inchangées).

-- --------------------------------------------------------------------------
-- 3. dms
-- --------------------------------------------------------------------------
drop policy if exists dms_select on public.dms;
create policy dms_select on public.dms
  for select to authenticated
  using (public.is_dm_member(id));

drop policy if exists dms_update on public.dms;
create policy dms_update on public.dms
  for update to authenticated
  using (public.is_dm_member(id));

-- dms_insert / dms_delete : déjà sans récursion (inchangées).

-- --------------------------------------------------------------------------
-- 4. messages
-- --------------------------------------------------------------------------
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.is_dm_member(dm_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_dm_member(dm_id));

-- messages_update / messages_delete : déjà sans récursion (inchangées).

-- --------------------------------------------------------------------------
-- 5. Stockage pièces-jointes (via dms, sans récursion)
-- --------------------------------------------------------------------------
drop policy if exists pj_read on storage.objects;
create policy pj_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pieces-jointes'
    and (storage.foldername(name))[1] in (
      select id::text from public.dms where public.is_dm_member(id)
    )
  );

drop policy if exists pj_write on storage.objects;
create policy pj_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pieces-jointes'
    and (storage.foldername(name))[1] in (
      select id::text from public.dms where public.is_dm_member(id)
    )
  );

drop policy if exists pj_delete on storage.objects;
create policy pj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pieces-jointes'
    and (storage.foldername(name))[1] in (
      select id::text from public.dms where public.is_dm_member(id)
    )
  );

-- --------------------------------------------------------------------------
-- 6. Réactions (si la migration reactions_pins a été appliquée)
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.message_reactions') is not null then
    drop policy if exists reactions_select on public.message_reactions;
    create policy reactions_select on public.message_reactions
      for select to authenticated
      using (exists (
        select 1 from public.messages msg
        where msg.id = message_reactions.message_id and public.is_dm_member(msg.dm_id)
      ));
    drop policy if exists reactions_insert on public.message_reactions;
    create policy reactions_insert on public.message_reactions
      for insert to authenticated
      with check (
        user_id = auth.uid()
        and exists (
          select 1 from public.messages msg
          where msg.id = message_reactions.message_id and public.is_dm_member(msg.dm_id)
        )
      );
    -- reactions_delete : déjà sans récursion (inchangée).
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 7. Épinglés (si appliqués)
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.message_pins') is not null then
    drop policy if exists pins_select on public.message_pins;
    create policy pins_select on public.message_pins
      for select to authenticated
      using (exists (
        select 1 from public.messages msg
        where msg.id = message_pins.message_id and public.is_dm_member(msg.dm_id)
      ));
    drop policy if exists pins_write on public.message_pins;
    create policy pins_write on public.message_pins
      for all to authenticated
      using (exists (
        select 1 from public.messages msg
        where msg.id = message_pins.message_id and public.is_dm_member(msg.dm_id)
      ))
      with check (exists (
        select 1 from public.messages msg
        where msg.id = message_pins.message_id and public.is_dm_member(msg.dm_id)
      ));
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 8. Sondages (si appliqués)
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.message_polls') is not null then
    drop policy if exists polls_select on public.message_polls;
    create policy polls_select on public.message_polls
      for select to authenticated
      using (exists (
        select 1 from public.messages msg
        where msg.id = message_polls.message_id and public.is_dm_member(msg.dm_id)
      ));
    drop policy if exists polls_insert on public.message_polls;
    create policy polls_insert on public.message_polls
      for insert to authenticated
      with check (
        created_by = auth.uid()
        and exists (
          select 1 from public.messages msg
          where msg.id = message_polls.message_id and public.is_dm_member(msg.dm_id)
        )
      );
    drop policy if exists polls_delete on public.message_polls;
    create policy polls_delete on public.message_polls
      for delete to authenticated
      using (created_by = auth.uid());
  end if;
  if to_regclass('public.message_poll_votes') is not null then
    drop policy if exists poll_votes_select on public.message_poll_votes;
    create policy poll_votes_select on public.message_poll_votes
      for select to authenticated
      using (exists (
        select 1 from public.message_polls p
        join public.messages msg on msg.id = p.message_id
        where p.id = message_poll_votes.poll_id and public.is_dm_member(msg.dm_id)
      ));
    drop policy if exists poll_votes_insert on public.message_poll_votes;
    create policy poll_votes_insert on public.message_poll_votes
      for insert to authenticated
      with check (
        user_id = auth.uid()
        and exists (
          select 1 from public.message_polls p
          join public.messages msg on msg.id = p.message_id
          where p.id = message_poll_votes.poll_id and public.is_dm_member(msg.dm_id)
        )
      );
    drop policy if exists poll_votes_delete on public.message_poll_votes;
    create policy poll_votes_delete on public.message_poll_votes
      for delete to authenticated
      using (user_id = auth.uid());
  end if;
end $$;
