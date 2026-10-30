import { EXCLUSIVE_LABEL, isExclusiveListing } from '@/lib/exclusivity';
import { SaveButton } from '@/components/SaveButton';
import { formatAddress, formatPrice } from '@/lib/format';
import type { SearchListing } from '@/types/search';

const Spec = ({ label, value }: { label: string; value: string | number | null }) =>
  value === null || value === '' ? null : (
    <div className="text-center">
      <div className="font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );

export function ListingCard({
  listing,
  onOpen,
  saved = false,
}: {
  listing: SearchListing;
  onOpen: (l: SearchListing) => void;
  /** Resolved once for the whole page rather than per card — see `SearchPage`. */
  saved?: boolean;
}) {
  const floor =
    listing.floor === null
      ? null
      : listing.buildingTopFloor
        ? `${listing.floor}/${listing.buildingTopFloor}`
        : listing.floor;

  const exclusive = isExclusiveListing(listing.amenities);
  // The badge over the photo already says it; the chips list what the property has.
  const amenities = listing.amenities.filter((a) => a !== EXCLUSIVE_LABEL);

  return (
    // The heart is a sibling of the card button, not a child of it. A button inside a
    // button is invalid HTML, and the browser rearranges the tree to cope — the heart
    // rendered in the right place and received no clicks at all, because hit testing
    // handed them to the card it was nested in.
    <div className="relative flex flex-col">
      {/*
        Top-left, opposite the badges. It is the one control on a card that does
        something other than open the listing.
      */}
      <div className="absolute left-2 top-2 z-10">
        <SaveButton listingId={listing.id} saved={saved} size="sm" />
      </div>

      <button
        type="button"
        onClick={() => onOpen(listing)}
        className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-right transition hover:border-slate-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900"
      >
      <div className="relative h-44 bg-slate-100">
        {listing.coverImageUrl ? (
          <img src={listing.coverImageUrl} alt={listing.propertyType ?? ''} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">ללא תמונה</div>
        )}

        {/*
          Stacked rather than placed in separate corners: a listing can be both, and two
          badges facing each other across the photo read as unrelated to one another.
        */}
        <div className="absolute top-2 start-2 flex flex-col items-start gap-1">
          {exclusive && (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 shadow-sm">
              {EXCLUSIVE_LABEL}
            </span>
          )}

          {listing.isNewFromDeveloper && (
            <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 shadow-sm">
              דירה חדשה
            </span>
          )}
        </div>

        {listing.tags.length > 0 && (
          <div className="absolute bottom-2 right-2 flex flex-wrap gap-1">
            {listing.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-700">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-bold text-slate-900">{formatPrice(listing.price)}</span>
          {listing.priceBeforeDrop && (
            <span className="text-sm text-slate-400 line-through">{formatPrice(listing.priceBeforeDrop)}</span>
          )}
        </div>

        <div>
          <div className="font-medium text-slate-800">
            {[listing.propertyType, listing.city].filter(Boolean).join(', ')}
          </div>
          <div className="text-sm text-slate-500">
            {formatAddress({
              street: listing.street ?? '',
              houseNumber: listing.houseNumber,
              neighborhood: listing.neighborhood ?? '',
              city: listing.city ?? '',
            })}
          </div>
        </div>

        <div className="mt-auto flex justify-around border-t border-slate-100 pt-3">
          <Spec label="חדרים" value={listing.rooms} />
          <Spec label="קומה" value={floor} />
          <Spec label='מ"ר' value={listing.squareMeter} />
        </div>

        {amenities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {amenities.slice(0, 4).map((a) => (
              <span key={a} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {a}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="truncate">{listing.agency.name}</span>
          {listing.pricePerSquareMeter && <span>{listing.pricePerSquareMeter.toLocaleString('he-IL')} ₪/מ״ר</span>}
        </div>
      </div>
      </button>
    </div>
  );
}
