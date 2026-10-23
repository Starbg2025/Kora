const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fullFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "14:32" */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "Aujourd'hui" / "Hier" / "12 mars 2026" */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return dayFmt.format(d);
}

/** "12 mars 2026 à 14:32" (attribut title) */
export function formatFull(iso: string): string {
  return fullFmt.format(new Date(iso));
}

/** "à l'instant" / "il y a 5 min" / "il y a 3 h" / date */
export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return dayFmt.format(new Date(iso));
}

/** Initiales pour l'avatar de repli ("Marie Dupont" -> "MD") */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Nom d'utilisateur valide : 3-32 caractères, lettres/chiffres/._- */
export function isValidUsername(u: string): boolean {
  return /^[a-zA-Z0-9_.-]{3,32}$/.test(u);
}
