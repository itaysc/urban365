import type { Listing } from '@prisma/client';
import { CANONICAL_AMENITIES, EXCLUSIVE_AMENITY, EXTRA_AMENITIES, toAsset } from './yad2.transform.js';
import type { Asset, RawListing } from './yad2.types.js';

const SUBCATEGORY: Record<string, number> = { forsale: 5, rent: 6, commercial: 7 };

/** Hebrew label → the yad2 flag it came from, so a stored label can be turned back. */
const FLAG_BY_LABEL = new Map(
  [...CANONICAL_AMENITIES, ...EXTRA_AMENITIES].map((a) => [a.label, a.key]),
);

/**
 * A listing created here stores amenities as the labels the agency ticked, while the
 * detail view derives them from yad2's boolean flags. Without this inversion a manual
 * listing's amenities showed on the card and vanished in the modal.
 */
function toInProperty(labels: string[]): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const label of labels) {
    const key = FLAG_BY_LABEL.get(label);
    if (key) flags[key] = true;
  }
  return flags;
}

/**
 * Exclusivity reaches a row two ways: yad2 ships it inside `raw` as a flag, and a
 * listing managed here carries the `isExclusive` column. Folding the column into the
 * flags leaves the Asset with one representation, so nothing downstream has to know
 * which path created the listing.
 *
 * The column wins over the payload: it is what the agency itself said, and a scrape
 * that predates the mandate should not be able to contradict it.
 */
function withExclusivity(
  flags: Record<string, boolean> | undefined,
  isExclusive: boolean,
): Record<string, boolean> | undefined {
  return isExclusive ? { ...flags, [EXCLUSIVE_AMENITY.key]: true } : flags;
}

/**
 * Rebuilds the full Asset shape from a stored row, so the agency view and the search
 * results open the same modal. The raw payload is used when present; card-only rows fall
 * back to the typed columns.
 */
export function listingRowToAsset(row: Listing): Asset {
  if (row.raw) {
    const raw = row.raw as RawListing;
    const source = { ...raw, inProperty: withExclusivity(raw.inProperty, row.isExclusive) };
    return toAsset(source, source);
  }

  return toAsset(
    {
      // RawListing models yad2's payload, where a token is always present. A row with
      // no token was created here, so there is nothing yad2-shaped to carry over.
      token: row.token ?? undefined,
      adNumber: row.adNumber === null ? undefined : Number(row.adNumber),
      price: row.price ?? undefined,
      subcategoryId: SUBCATEGORY[row.section],
      additionalDetails: {
        property: { text: row.propertyType ?? undefined },
        propertyGroup: { text: row.propertyGroup ?? undefined },
        propertyCondition: { text: row.propertyCondition ?? undefined },
        roomsCount: row.rooms ?? undefined,
        squareMeter: row.squareMeter ?? undefined,
        squareMeterBuild: row.squareMeterBuilt ?? undefined,
        buildingTopFloor: row.buildingTopFloor ?? undefined,
        parkingSpacesCount: row.parkingSpacesCount ?? undefined,
        balconiesCount: row.balconiesCount ?? undefined,
      },
      address: {
        city: { text: row.city ?? undefined },
        neighborhood: { text: row.neighborhood ?? undefined },
        street: { text: row.street ?? undefined },
        region: { text: row.region ?? undefined },
        area: { text: row.area ?? undefined },
        house: { floor: row.floor ?? undefined, number: row.houseNumber ?? undefined },
        coords: { lat: row.latitude ?? undefined, lon: row.longitude ?? undefined },
      },
      metaData: {
        coverImage: row.coverImageUrl ?? undefined,
        images: row.imageUrls,
        description: row.description ?? undefined,
      },
      inProperty: withExclusivity(toInProperty(row.amenities), row.isExclusive),
      customer: { name: row.contactName ?? undefined, brokers: [{ name: row.brokerName ?? undefined }] },
    },
    null,
  );
}
