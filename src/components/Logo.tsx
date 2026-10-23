/** Logo Kora : lettre K dont la barre verticale devient des ondes sonores. */
export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Kora">
      <rect width="48" height="48" rx="12" fill="#7C3AED" />
      {/* K */}
      <path
        d="M15 9 v30 M15.5 24.5 L29 11 M17.5 26.5 L31 38"
        stroke="#FFFFFF"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Ondes sonores (ambre) */}
      <path
        d="M34 17.5 a7.5 7.5 0 0 1 0 13"
        stroke="#F59E0B"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M38.5 13.5 a12.5 12.5 0 0 1 0 21"
        stroke="#F59E0B"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
    </svg>
  );
}
