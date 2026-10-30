/**
 * Drawn as SVG rather than the `‹` / `›` characters: those are Bidi_Mirrored, so inside
 * this RTL page the browser flips them and each arrow ends up pointing the wrong way.
 */
export function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
