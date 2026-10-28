import type { Amenity } from '@/types/yad2';

const Check = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5 flex-none" aria-hidden="true">
    <path
      d="M4 10.5l4 4 8-9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Dash = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5 flex-none" aria-hidden="true">
    <path d="M5 10h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/**
 * "מה יש בנכס" — yad2 prints the same ten rows on every listing and greys out the ones
 * the property does not have, so the absence is information too.
 */
export function AmenityGrid({ amenities }: { amenities: Amenity[] }) {
  if (amenities.length === 0) return null;

  return (
    <section>
      <h3 className="mb-3 font-semibold text-slate-900">מה יש בנכס</h3>
      <ul className="grid grid-cols-2 gap-y-3 sm:grid-cols-4">
        {amenities.map((a) => (
          <li
            key={a.key}
            className={`flex items-center gap-2 text-sm ${a.present ? 'text-slate-800' : 'text-slate-300'}`}
          >
            {a.present ? <Check /> : <Dash />}
            <span className={a.present ? '' : 'line-through decoration-slate-300'}>{a.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
