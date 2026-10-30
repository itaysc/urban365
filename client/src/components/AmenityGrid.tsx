import { amenityIcon } from '@/components/listing/amenities';
import type { Amenity } from '@/types/yad2';

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
        {amenities.map((a) => {
          // The thing itself rather than a tick. A row says two things — what it is and
          // whether the property has it — and the picture can carry the first, leaving
          // the greying and the strike-through to carry the second on their own.
          const Icon = amenityIcon(a.label);
          return (
            <li
              key={a.key}
              className={`flex items-center gap-2 text-sm ${a.present ? 'text-slate-800' : 'text-slate-300'}`}
            >
              <Icon
                className={`h-5 w-5 flex-none ${a.present ? 'text-slate-500' : 'text-slate-300'}`}
                aria-hidden
              />
              <span className={a.present ? '' : 'line-through decoration-slate-300'}>{a.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
