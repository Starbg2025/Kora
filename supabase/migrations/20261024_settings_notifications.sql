-- ============================================================================
-- KORA — Paramètres étendus + Centre de notifications
-- 1. user_settings : couleur d'accent, taille du texte, réduction des
--    animations, préférences de notifications par type.
-- 2. profiles.is_disabled : désactivation de compte (réversible).
-- 3. Table notifications + fonction create_notification (SECURITY DEFINER).
-- À exécuter dans l'éditeur SQL Supabase (ré-exécutable sans risque).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Colonnes user_settings
-- --------------------------------------------------------------------------
alter table public.user_settings add column if not exists accent_color text not null default '#7C3AED';
alter table public.user_settings add column if not exists text_size text not null default 'normal'
  check (text_size in ('petit', 'normal', 'grand'));
alter table public.user_settings add column if not exists reduce_motion boolean not null default false;
alter table public.user_settings add column if not exists notif_messages boolean not null default true;
alter table public.user_settings add column if not exists notif_mentions boolean not null default true;
alter table public.user_settings add column if not exists notif_friend_requests boolean not null default true;
alter table public.user_settings add column if not exists notif_invites boolean not null default true;
alter table public.user_settings add column if not exists notif_calls boolean not null default true;

-- --------------------------------------------------------------------------
-- 2. Désactivation de compte (profiles.is_disabled)
-- --------------------------------------------------------------------------
alter table public.profiles add column if not exists is_disabled boolean not null default false;

-- --------------------------------------------------------------------------
-- 3. Table notifications
-- --------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('message', 'mention', 'demande_ami', 'invitation', 'appel', 'communaute')),
  title text not null,
  body text not null default '',
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- RLS strictement personnelle : aucune sous-requête, donc aucune récursion.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- Pas d'INSERT direct côté client : on passe par la fonction ci-dessous,
-- qui n'autorise la création que pour soi-même (déclencheurs côté client
-- du destinataire via ses canaux temps réel).
create or replace function public.create_notification(
  p_user uuid,
  p_type text,
  p_title text,
  p_body text default '',
  p_link text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'Non autorisé : notification pour soi-même uniquement';
  end if;
  if p_type not in ('message', 'mention', 'demande_ami', 'invitation', 'appel', 'communaute') then
    raise exception 'Type de notification invalide';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Titre requis';
  end if;
  insert into public.notifications (user_id, type, title, body, link)
    values (p_user, p_type, trim(p_title), coalesce(p_body, ''), p_link)
    returning id into v_id;
  return v_id;
end $$;

-- --------------------------------------------------------------------------
-- 4. Temps réel
-- --------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
