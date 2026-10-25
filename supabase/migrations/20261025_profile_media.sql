-- Kora — Images de bannière de profil (20261025, façon Yapper)
-- Les avatars animés (GIF) fonctionnent déjà : l'upload accepte image/* et
-- l'avatar s'affiche dans un <img> (les GIF jouent en animé). Cette migration
-- ajoute seulement l'image de bannière : banner_url prend le pas sur la
-- couleur (banner_color reste le repli si aucune image).
-- Ré-exécutable sans danger : aucune policy à changer, la mise à jour du
-- profil reste limitée à sa propre ligne (policy existante).
alter table public.profiles
  add column if not exists banner_url text;
