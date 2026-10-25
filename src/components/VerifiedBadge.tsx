/**
 * Badge de certification Kora : pastille violette originale avec coche blanche.
 * Ce n'est PAS la copie d'un badge d'une autre plateforme : géométrie propre,
 * couleurs Kora (violet #7C3AED), sans étoile ni fioriture.
 */
export default function VerifiedBadge({ size = 16, title = 'Compte vérifié' }: { size?: number; title?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary align-middle"
      style={{ width: size, height: size }}
      title={title}
      aria-label={title}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}
