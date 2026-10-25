/** Décorations d'avatar Kora (CSS/SVG simples, créations originales — aucune
 *  reprise des décorations d'applications tierces) et thèmes de profil. */

/** Décoration : id, libellé, style d'anneau appliqué autour de l'avatar. */
export const AVATAR_FRAMES: { id: string; label: string; ring: string; outer?: string }[] = [
  { id: 'none', label: 'Aucune', ring: 'transparent' },
  { id: 'anneau', label: 'Anneau', ring: 'rgb(var(--c-primary))' },
  { id: 'double', label: 'Double anneau', ring: 'rgb(var(--c-primary))', outer: '#ffffff' },
  { id: 'epais', label: 'Anneau épais', ring: 'rgb(var(--c-primary))' },
];

export function frameStyle(frame: string | null | undefined): { boxShadow: string } | undefined {
  if (!frame || frame === 'none') return undefined;
  if (frame === 'anneau') return { boxShadow: '0 0 0 2px rgb(var(--c-primary))' };
  if (frame === 'double')
    return { boxShadow: '0 0 0 2px #ffffff, 0 0 0 4px rgb(var(--c-primary))' };
  if (frame === 'epais') return { boxShadow: '0 0 0 4px rgb(var(--c-primary))' };
  return undefined;
}

/** Thème de profil à deux couleurs : bannière (c1) + accent de la fiche (c2). */
export const PROFILE_THEMES: { id: string; label: string; c1: string; c2: string }[] = [
  { id: 'defaut', label: 'Défaut Kora', c1: '#FF6A00', c2: '#1C1C2B' },
  { id: 'nuit', label: 'Nuit', c1: '#0D0D17', c2: '#FF6A00' },
  { id: 'foret', label: 'Forêt', c1: '#14532D', c2: '#86EFAC' },
  { id: 'ocean', label: 'Océan', c1: '#0C4A6E', c2: '#38BDF8' },
  { id: 'soleil', label: 'Soleil', c1: '#B45309', c2: '#FCD34D' },
  { id: 'rose', label: 'Rose', c1: '#9D174D', c2: '#F9A8D4' },
  { id: 'lavande', label: 'Lavande', c1: '#5B21B6', c2: '#C4B5FD' },
  { id: 'menthe', label: 'Menthe', c1: '#064E3B', c2: '#6EE7B7' },
  { id: 'ardoise', label: 'Ardoise', c1: '#334155', c2: '#94A3B8' },
  { id: 'cerise', label: 'Cerise', c1: '#881337', c2: '#FDA4AF' },
  { id: 'sable', label: 'Sable', c1: '#78350F', c2: '#FDE68A' },
  { id: 'glace', label: 'Glace', c1: '#164E63', c2: '#A5F3FC' },
];

export function parseProfileTheme(raw: string | null | undefined): { c1: string; c2: string } | null {
  if (!raw) return null;
  if (raw.startsWith('custom:')) {
    const parts = raw.split(':');
    if (parts.length === 3 && /^#[0-9a-fA-F]{6}$/.test(parts[1]) && /^#[0-9a-fA-F]{6}$/.test(parts[2])) {
      return { c1: parts[1], c2: parts[2] };
    }
    return null;
  }
  const preset = PROFILE_THEMES.find((t) => t.id === raw);
  return preset ? { c1: preset.c1, c2: preset.c2 } : null;
}

/** Couleur d'accent d'un serveur : hex valide, sinon null (repli = accent app). */
export function validHex(c: string | null | undefined): string | null {
  if (!c) return null;
  const t = c.trim();
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t : null;
}
