/** Mode développeur (appareil uniquement) : ajoute « Copier l'ID » aux menus.
 *  Stocké en localStorage, comme les réglages de sons du navigateur. */

const KEY = 'kora:dev-mode';

export function isDevMode(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setDevMode(v: boolean): void {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* stockage indisponible */
  }
  window.dispatchEvent(new Event('kora:dev-mode-changed'));
}

/** Couleurs propres aux serveurs : interrupteur d'apparence (appareil). */
const SERVER_COLORS_KEY = 'kora:use-server-colors';

export function useServerColors(): boolean {
  try {
    const v = localStorage.getItem(SERVER_COLORS_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function setUseServerColors(v: boolean): void {
  try {
    localStorage.setItem(SERVER_COLORS_KEY, v ? '1' : '0');
  } catch {
    /* stockage indisponible */
  }
  window.dispatchEvent(new Event('kora:server-colors-changed'));
}

/** Marquer tous les salons d'une communauté comme lus (visites locales). */
export function markCommunityRead(channelIds: string[]): void {
  try {
    const visits = JSON.parse(localStorage.getItem('kora:channel-visits') ?? '{}') as Record<string, string>;
    const now = new Date().toISOString();
    for (const id of channelIds) visits[id] = now;
    localStorage.setItem('kora:channel-visits', JSON.stringify(visits));
  } catch {
    /* stockage indisponible */
  }
  window.dispatchEvent(new Event('kora:channel-visits-changed'));
}
