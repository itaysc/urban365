import { useLayoutEffect, useRef, useState } from 'react';
import { EXCLUSIVE_LABEL, isExclusiveListing } from '@/lib/exclusivity';
import { SaveButton } from '@/components/SaveButton';
import { isNew, priceDrop } from '@/lib/listingBadges';
import { amenityIcon } from '@/components/listing/amenities';
import { formatAddress, formatPrice, formatShekel } from '@/lib/format';
import type { SearchListing } from '@/types/search';

const CHIP = 'flex shrink-0 items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600';

/** How many leading chips fit on one line, leaving room for "עוד N" when some remain. */
function fittingCount(widths: number[], available: number, moreWidth: number, gap: number, total: number): number {
  const limit = Math.min(3, widths.length, total);
  let best = 0;
  for (let n = 1; n <= limit; n++) {
    let width = 0;
    for (let i = 0; i < n; i++) width += widths[i] + (i > 0 ? gap : 0);
    const remaining = total - n;
    if (remaining > 0) width += gap + moreWidth;
    if (width <= available + 1) best = n;
    else break;
  }
  return best === 0 && total > 0 ? 1 : best;
}

function AmenityChip({ label }: { label: string }) {
  const Icon = amenityIcon(label);
  return (
    <span data-chip className={CHIP}>
      <Icon className="h-3 w-3 text-slate-500" aria-hidden />
      {label}
    </span>
  );
}

/**
 * One line, always the same height. Two or three labels when they fit, then "עוד 3"
 * for whatever did not — a second line of chips is what was making the cards differ.
 */
function AmenityLine({ amenities }: { amenities: string[] }) {
  const row = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => Math.min(3, amenities.length));

  const key = amenities.join('\0');

  useLayoutEffect(() => {
    const fit = () => {
      const available = row.current?.clientWidth ?? 0;
      const chips = [...(probe.current?.querySelectorAll<HTMLElement>('[data-chip]') ?? [])];
      const more = probe.current?.querySelector<HTMLElement>('[data-more]');
      if (available === 0 || chips.length === 0) return;
      const gap = parseFloat(getComputedStyle(probe.current as HTMLElement).columnGap) || 0;
      setShown(fittingCount(chips.map((chip) => chip.offsetWidth), available, more?.offsetWidth ?? 0, gap, amenities.length));
    };

    fit();
    const observer = new ResizeObserver(fit);
    if (row.current) observer.observe(row.current);
    return () => observer.disconnect();
    // The labels are the dependency; the array is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const visible = amenities.slice(0, shown);
  const rest = amenities.length - visible.length;

  return (
    <div ref={row} className="relative h-6 overflow-hidden">
      <div ref={probe} className="pointer-events-none invisible absolute flex gap-1" aria-hidden>
        {amenities.slice(0, 3).map((label) => (
          <AmenityChip key={label} label={label} />
        ))}
        <span data-more className={CHIP}>
          עוד {Math.max(amenities.length - 1, 1)}
        </span>
      </div>
      {visible.length > 0 && (
        <div className="flex gap-1">
          {visible.map((label) => (
            <AmenityChip key={label} label={label} />
          ))}
          {rest > 0 && <span className={CHIP}>עוד {rest.toLocaleString('he-IL')}</span>}
        </div>
      )}
    </div>
  );
}

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
  // Both time-limited; see `listingBadges`. A page where half the cards shout has
  // told the reader nothing.
  const drop = priceDrop(listing);
  const fresh = isNew(listing);
  // The badge over the photo already says it; the chips list what the property has.
  const amenities = listing.amenities.filter((a) => a !== EXCLUSIVE_LABEL);

  return (
    // The heart is a sibling of the card button, not a child of it. A button inside a
    // button is invalid HTML, and the browser rearranges the tree to cope — the heart
    // rendered in the right place and received no clicks at all, because hit testing
    // handed them to the card it was nested in.
    <div className="relative flex h-full flex-col">
      {/*
        Top-left, opposite the badges. It is the one control on a card that does
        something other than open the listing.
      */}
      <div className="absolute left-2 top-2 z-10">
        <SaveButton listingId={listing.id} saved={saved} savedCount={listing.savedCount} size="sm" />
      </div>

      <button
        type="button"
        onClick={() => onOpen(listing)}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-right transition hover:border-slate-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900"
      >
      <div className="relative h-44 bg-slate-100">
        {/*
          The photo carries `alt=""` on purpose. The whole card is one button, so its
          accessible name is everything inside it — and the words under the photo
          already say the property type and the city. An alt of "דירת גן" made a
          screen reader read that twice before reaching the price, and bought nothing:
          nobody here has seen this photograph, so it cannot be described, only
          re-labelled.
        */}
        {listing.coverImageUrl ? (
          <img src={listing.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">ללא תמונה</div>
        )}

        {/*
          Stacked rather than placed in separate corners: a listing can be both, and two
          badges facing each other across the photo read as unrelated to one another.
        */}
        <div className="absolute top-2 start-2 flex max-w-[calc(100%-4.5rem)] flex-col items-start gap-1">
          {/*
            Who is selling, on the photo rather than under the specs. The heart sits in
            the opposite corner, so the name stops short of it.
          */}
          {listing.agency && (
            <span className="max-w-full truncate rounded-md bg-white/95 px-2 py-0.5 text-xs font-semibold text-slate-800 shadow-sm">
              {listing.agency.name}
            </span>
          )}

          {/*
            The drop first: it is the one that changes a decision. Dark green and the
            figure spelled out, because "ירידת מחיר" without the number is an
            advertisement and with it is information.
          */}
          {drop !== null && (
            <span className="rounded-md bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
              ירידת מחיר {formatShekel(-drop)}
            </span>
          )}

          {fresh && (
            <span className="rounded-md bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900 shadow-sm">
              חדש!
            </span>
          )}

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
        <div className="flex h-7 items-baseline justify-between gap-2 whitespace-nowrap">
          <span className="text-xl font-bold text-slate-900">{formatPrice(listing.price)}</span>
          {listing.priceBeforeDrop && (
            <span className="truncate text-sm text-slate-500 line-through">{formatPrice(listing.priceBeforeDrop)}</span>
          )}
        </div>

        <div>
          <div className="truncate font-medium text-slate-800">
            {[listing.propertyType, listing.city].filter(Boolean).join(', ')}
          </div>
          <div className="truncate text-sm text-slate-500">
            {formatAddress({
              street: listing.street ?? '',
              houseNumber: listing.houseNumber,
              neighborhood: listing.neighborhood ?? '',
              city: listing.city ?? '',
            }) || '\u00a0'}
          </div>
        </div>

        <div className="mt-auto flex justify-around border-t border-slate-100 pt-3">
          <Spec label="חדרים" value={listing.rooms} />
          <Spec label="קומה" value={floor} />
          <Spec label='מ"ר' value={listing.squareMeter} />
        </div>

        <AmenityLine amenities={amenities} />

        <div className="flex h-4 items-center justify-between text-xs text-slate-500">
          {/* A private seller has no agency. Saying who is selling matters to a buyer,
              so the absence is filled rather than left blank. An agency's name is on
              the photo. */}
          {!listing.agency && <span className="truncate">מוכר פרטי</span>}
          {listing.pricePerSquareMeter && (
            <span>{listing.pricePerSquareMeter.toLocaleString('he-IL')} ₪/מ״ר</span>
          )}
        </div>
      </div>
      </button>
    </div>
  );
}
