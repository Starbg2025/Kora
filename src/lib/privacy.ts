import type { Profile } from './types';

/**
 * Statut de présence réellement visible par le spectateur, selon le réglage
 * de confidentialité de la cible (profiles.privacy_status) :
 * - 'nobody' : toujours hors ligne pour les autres ;
 * - 'friends' : visible uniquement par les amis (et par soi-même) ;
 * - 'everyone' (défaut) : statut réel.
 * Le statut en ligne temps réel (onlineStatus) l'emporte sur le statut du
 * profil quand il est visible.
 */
export function effectiveStatus(
  target: Pick<Profile, 'id' | 'status' | 'privacy_status'>,
  viewerId: string | null,
  friendIds: ReadonlySet<string>,
  onlineStatus?: string | null,
): string {
  const privacy = target.privacy_status ?? 'everyone';
  if (viewerId && viewerId !== target.id) {
    if (privacy === 'nobody') return 'hors_ligne';
    if (privacy === 'friends' && !friendIds.has(target.id)) return 'hors_ligne';
  }
  return onlineStatus ?? target.status ?? 'hors_ligne';
}

/** Normalise un lien social saisi par l'utilisateur (ajoute https:// si besoin). */
export function normalizeSocialLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}
