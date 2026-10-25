/** Détecte une mention @pseudo dans un contenu (insensible à la casse, frontière de mot). */
export function containsMention(content: string, username: string): boolean {
  if (!content || !username) return false;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`@${escaped}(?![a-zA-Z0-9_.-])`, 'i');
  return re.test(content);
}

/** Détecte @everyone (insensible à la casse, frontière de mot). */
export function containsEveryone(content: string): boolean {
  if (!content) return false;
  return /@everyone(?![a-zA-Z0-9_.-])/i.test(content);
}

/** Échappe un pseudo pour une recherche ilike (%, _ et \ sont des jokers). */
export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Extrait un aperçu court d'un message pour le corps d'une notification. */
export function snippet(content: string, max = 80): string {
  const s = content.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
