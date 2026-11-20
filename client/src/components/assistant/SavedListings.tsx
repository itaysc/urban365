import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/format';
import { fetchSavedListings } from '@/services/saved';
import type { SearchListing } from '@/types/search';

const PAGE = 5;

/** A listing page accepts a bare id, so the card does not have to rebuild the address slug. */
function listingHref(listing: SearchListing): string {
  return `/nadlan/property/${listing.id}`;
}

function where(listing: SearchListing): string {
  const street = [listing.street, listing.houseNumber].filter((part) => part !== null && part !== '').join(' ');
  return [street, listing.neighborhood, listing.city].filter(Boolean).join(', ');
}

function facts(listing: SearchListing): string {
  return [
    listing.rooms !== null ? `${listing.rooms} חדרים` : '',
    listing.squareMeter !== null ? `${listing.squareMeter} מ״ר` : '',
    listing.floor !== null ? `קומה ${listing.floor}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The caller's saved listings, five at a time. */
export function SavedListings() {
  const [items, setItems] = useState<SearchListing[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    void fetchSavedListings()
      .then((loaded) => {
        if (!cancelled) setItems(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="u365-a2ui-body">לא הצלחתי לטעון את הנכסים השמורים.</p>;
  if (!items) return <p className="u365-a2ui-body">טוען את הנכסים השמורים...</p>;
  if (items.length === 0) {
    return (
      <p className="u365-a2ui-body">
        עדיין אין נכסים שמורים. <a href="/saved">לעמוד השמורים</a>
      </p>
    );
  }

  const shown = items.slice(0, visible);
  const more = items.length - shown.length;

  return (
    <div className="u365-saved">
      {shown.map((listing) => (
        <a key={listing.id} className="u365-saved-card" href={listingHref(listing)}>
          {listing.coverImageUrl ? (
            <img src={listing.coverImageUrl} alt="" />
          ) : (
            <span className="u365-saved-photo" aria-hidden="true" />
          )}
          <span className="u365-saved-copy">
            <strong>{where(listing) || 'נכס שמור'}</strong>
            {facts(listing) && <span>{facts(listing)}</span>}
            <span className="u365-saved-price">{formatPrice(listing.price)}</span>
          </span>
        </a>
      ))}
      {more > 0 && (
        <button type="button" className="u365-saved-more" onClick={() => setVisible((count) => count + PAGE)}>
          הצג עוד {Math.min(PAGE, more)}
        </button>
      )}
    </div>
  );
}
