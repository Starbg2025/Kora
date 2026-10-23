const PINNED_KEY = 'kora:pinned-dms';

/** IDs des conversations épinglées en haut de la liste (préférence de cet appareil). */
export function getPinnedDMs(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function setPinnedDMs(ids: string[]) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
  } catch {
    /* stockage indisponible */
  }
}
