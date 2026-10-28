import type { Listing } from '@prisma/client';
import { toAsset } from './yad2.transform.js';
import type { Asset, RawListing } from './yad2.types.js';

const SUBCATEGORY: Record<string, number> = { forsale: 5, rent: 6, commercial: 7 };

/**
 * Rebuilds the full Asset shape from a stored row, so the agency view and the search
 * results open the same modal. The raw payload is used when present; card-only rows fall
 * back to the typed columns.
 */
export function listingRowToAsset(row: Listing): Asset {
  if (row.raw) return toAsset(row.raw as RawListing, row.raw as RawListing);

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
      customer: { name: row.contactName ?? undefined, brokers: [{ name: row.brokerName ?? undefined }] },
    },
    null,
  );
}
