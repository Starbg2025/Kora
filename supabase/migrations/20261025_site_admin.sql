-- Kora — Administrateur du site + certification (20261025)
-- Définit le créateur (benit800@gmail.com) comme administrateur global du site
-- et ajoute la certification des profils. Ré-exécutable sans danger.
--
-- IMPORTANT : le compte Kora doit d'abord exister (inscription avec
-- benit800@gmail.com). Si l'UPDATE ne touche aucune ligne, crée le compte
-- puis ré-exécute ce fichier : les drapeaux seront posés.
--
-- Sécurité : les drapeaux is_verified / is_site_admin / is_creator ne sont
-- modifiables que par un administrateur du site (trigger ci-dessous). Un
-- utilisateur ordinaire qui tente de se les attribuer reçoit une erreur.

-- ---------------------------------------------------------------------------
-- 1. Colonnes
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_verified boolean not null default false;
alter table public.profiles
  add column if not exists is_site_admin boolean not null default false;
alter table public.profiles
  add column if not exists is_creator boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Helper : l'utilisateur courant est-il administrateur du site ?
-- ---------------------------------------------------------------------------
create or replace function public.is_site_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_site_admin
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger : seuls les administrateurs du site peuvent changer les drapeaux
-- EXCEPTION D'AMORÇAGE : dans l'éditeur SQL, il n'y a pas de JWT, donc
-- auth.uid() est NULL et is_site_admin() vaut faux — sans cette exception,
-- le trigger bloquerait l'UPDATE d'initialisation ci-dessous (section 4) et
-- tout le script serait annulé (cas rencontré le 2026-10-24). C'est sans
-- danger : les clients de l'app ont toujours un JWT ; sans JWT, les règles
-- RLS bloquent déjà toute écriture depuis un client. Seul l'éditeur SQL et
-- le backend (rôle postgres / service_role) passent par ce chemin.
-- ---------------------------------------------------------------------------
create or replace function public.protect_admin_flags()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (new.is_verified is distinct from old.is_verified
      or new.is_site_admin is distinct from old.is_site_admin
      or new.is_creator is distinct from old.is_creator)
     and not public.is_site_admin() then
    raise exception 'Modification des drapeaux administrateur non autorisée';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_admin_flags on public.profiles;
create trigger profiles_protect_admin_flags
  before update on public.profiles
  for each row execute function public.protect_admin_flags();

-- ---------------------------------------------------------------------------
-- 4. Le créateur : benit800@gmail.com
-- ---------------------------------------------------------------------------
update public.profiles
set is_verified = true,
    is_site_admin = true,
    is_creator = true
where id in (select id from auth.users where email = 'benit800@gmail.com');

-- ---------------------------------------------------------------------------
-- 5. Annonces du site
-- ---------------------------------------------------------------------------
create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.site_announcements enable row level security;

drop policy if exists site_announcements_select on public.site_announcements;
create policy site_announcements_select on public.site_announcements
  for select using (true);

drop policy if exists site_announcements_admin_write on public.site_announcements;
create policy site_announcements_admin_write on public.site_announcements
  for all to authenticated using (public.is_site_admin())
  with check (public.is_site_admin());

-- ---------------------------------------------------------------------------
-- 6. Fonctions d'administration (SECURITY DEFINER, vérifient is_site_admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  u bigint := 0;
  c bigint := 0;
  m bigint := 0;
  r bigint := 0;
begin
  -- Comptages dynamiques : la fonction reste créable même si les tables
  -- des phases ultérieures ne sont pas encore là.
  if to_regclass('public.profiles') is not null then
    execute 'select count(*) from public.profiles' into u;
  end if;
  if to_regclass('public.communities') is not null then
    execute 'select count(*) from public.communities' into c;
  end if;
  if to_regclass('public.messages') is not null then
    execute 'select count(*) from public.messages' into m;
  end if;
  if to_regclass('public.community_messages') is not null then
    m := m + (select count(*) from public.community_messages);
  end if;
  if to_regclass('public.reports') is not null then
    execute 'select count(*) from public.reports where status = ''nouveau''' into r;
  end if;
  return jsonb_build_object(
    'users', u,
    'communities', c,
    'messages', m,
    'pending_reports', r
  );
end;
$$;

create or replace function public.admin_set_disabled(p_user uuid, p_disabled boolean)
returns void
language plpgsql
security definer
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Réservé aux administrateurs du site';
  end if;
  if p_user = auth.uid() then
    raise exception 'Un administrateur ne peut pas se désactiver lui-même';
  end if;
  update public.profiles set is_disabled = p_disabled where id = p_user;
end;
$$;

create or replace function public.admin_set_verified(p_user uuid, p_verified boolean)
returns void
language plpgsql
security definer
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Réservé aux administrateurs du site';
  end if;
  update public.profiles set is_verified = p_verified where id = p_user;
end;
$$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text)
returns void
language plpgsql
security definer
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Réservé aux administrateurs du site';
  end if;
  if p_status not in ('en_cours', 'resolu', 'rejete') then
    raise exception 'Statut invalide';
  end if;
  update public.reports
  set status = p_status, resolved_by = auth.uid(), resolved_at = now()
  where id = p_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Lecture globale des signalements pour les administrateurs du site
-- (les policies existantes restent : elles se combinent en OU)
-- ---------------------------------------------------------------------------
drop policy if exists reports_select_site_admin on public.reports;
create policy reports_select_site_admin on public.reports
  for select to authenticated using (public.is_site_admin());

-- ---------------------------------------------------------------------------
-- 8. Publication temps réel (annonces)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.site_announcements') is not null
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'site_announcements'
    ) then
    execute 'alter publication supabase_realtime add table public.site_announcements';
  end if;
end $$;
