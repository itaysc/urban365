import { useQuery } from '@tanstack/react-query';
import { formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import { fetchSavedAmong } from '@/services/saved';
import { SaveButton } from '@/components/SaveButton';
import type { MapPoint } from '@/services/search';

interface Props {
  point: MapPoint;
  /** Opens the full listing — the card is a preview, not the whole thing. */
  onOpen: (id: string) => void;
}

/** "3 חדרים • קומה 2 • 86 מ״ר", leaving out whatever the listing does not say. */
function specLine(point: MapPoint): string {
  return [
    point.rooms !== null && `${point.rooms} חדרים`,
    point.floor !== null && `קומה ${point.floor}`,
    point.squareMeter !== null && `${point.squareMeter} מ״ר`,
  ]
    .filter(Boolean)
    .join(' • ');
}

/** "דירה, ניצנה, בת ים" */
function placeLine(point: MapPoint): string {
  return [point.propertyType, point.neighborhood, point.city].filter(Boolean).join(', ');
}

export function ListingPopupCard({ point, onOpen }: Props) {
  const ids = [point.id];

  // No longer gated on being signed in: saving works for a signed-out browser too, and
  // the server answers this from the visitor cookie when there is no account.
  const { data: saved } = useQuery({
    queryKey: qk.saved.among(ids),
    queryFn: () => fetchSavedAmong(ids),
  });

  const isSaved = saved?.has(point.id) ?? false;

  return (
    <div // max-w-full so the wrapper, which knows the map width, can cap it.
      className="w-[22rem] max-w-full overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex items-stretch">
        {/*
          Image first in the DOM, which in an RTL column puts it on the right — where
          the design this follows has it. Everything here is laid out in logical
          properties, so an LTR locale mirrors it without a second stylesheet.
        */}
        <button
          type="button"
          onClick={() => onOpen(point.id)}
          className="relative h-32 w-36 shrink-0 bg-slate-100 text-start"
          aria-label="פתיחת הנכס"
        >
          {point.coverImageUrl ? (
            <img
              src={point.coverImageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              ללא תמונה
            </span>
          )}

          {point.isExclusive && (
            <span className="absolute end-2 top-2 rounded-md bg-white/95 px-2 py-0.5 text-xs font-semibold text-slate-900 shadow-sm">
              בלעדי
            </span>
          )}

          {point.agencyName && (
            // A gradient rather than a solid strip: the agency name has to stay legible
            // over whatever the photo happens to be behind it.
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-start text-xs font-medium text-white">
              {point.agencyName}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onOpen(point.id)}
          className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-3 text-start"
        >
          <p className="text-lg font-bold text-slate-900">{formatPrice(point.price)}</p>
          {point.street && <p className="truncate text-sm text-slate-700">{point.street}</p>}
          <p className="truncate text-sm text-slate-500">{placeLine(point)}</p>
          <p className="truncate text-sm text-slate-500">{specLine(point)}</p>
        </button>

        <div className="flex items-start p-2">
          <SaveButton listingId={point.id} saved={isSaved} count={point.savedCount} />
        </div>
      </div>
    </div>
  );
}
