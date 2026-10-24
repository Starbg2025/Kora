-- Kora — Salons vocaux : autorise le type 'voice' sur la table channels.
-- Les salons vocaux sont créés en base et listés, mais l'audio temps réel
-- arrive dans une phase ultérieure (aucun faux appel n'est présenté).
-- Idempotent : ré-exécutable sans erreur.
do $$
begin
  alter table public.channels drop constraint if exists channels_type_check;
  alter table public.channels add constraint channels_type_check check (type in ('text', 'voice'));
exception when duplicate_object then
  null;
end $$;
