-- Kora — Correctif publication temps réel (20261025)
-- Contexte : certains utilisateurs doivent rafraîchir la page pour voir les
-- nouveaux messages. Une cause fréquente : des tables créées après coup ne
-- sont pas membres de la publication `supabase_realtime`, donc aucun événement
-- postgres_changes n'est émis pour elles. Ce script (ré-exécutable) ajoute
-- TOUTES les tables applicatives à la publication, sans jamais échouer si une
-- table est absente (migration non encore exécutée) ou déjà membre.
-- À exécuter dans l'éditeur SQL Supabase.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'messages', 'dms', 'dm_members', 'friendships', 'profiles',
    'message_reactions', 'message_pins', 'message_polls', 'message_poll_votes',
    'communities', 'community_members', 'channel_categories', 'channels',
    'community_messages', 'community_message_reactions', 'community_message_pins',
    'community_invites', 'notifications', 'user_settings',
    'server_bans', 'server_timeouts', 'reports', 'audit_logs',
    'call_logs', 'custom_stickers', 'site_announcements', 'call_invites'
  ]) loop
    if to_regclass('public.' || t) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
