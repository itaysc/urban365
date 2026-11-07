/**
 * What an agency can buy so it can publish listings it types into the app.
 *
 * Prices are agorot — 100 to the shekel — so a shekel amount never becomes a float.
 * A single listing, bought on its own, is 25 ILS. A pack brings the price of each
 * listing in it down.
 */
export const LISTING_PACKAGES = [
  { size: 1, unitAgorot: 2_500 },
  { size: 10, unitAgorot: 2_000 },
  { size: 50, unitAgorot: 1_700 },
  { size: 100, unitAgorot: 1_500 },
] as const;

export type PackageSize = (typeof LISTING_PACKAGES)[number]['size'];

export interface ListingPackageQuote {
  size: PackageSize;
  unitAgorot: number;
  totalAgorot: number;
}

export function listingPackage(size: number): ListingPackageQuote | null {
  const found = LISTING_PACKAGES.find((pack) => pack.size === size);
  if (!found) return null;
  return { size: found.size, unitAgorot: found.unitAgorot, totalAgorot: found.size * found.unitAgorot };
}

/** The four packs, each with its total, in the order they are offered. */
export function listingPackageCatalog(): ListingPackageQuote[] {
  return LISTING_PACKAGES.map((pack) => ({
    size: pack.size,
    unitAgorot: pack.unitAgorot,
    totalAgorot: pack.size * pack.unitAgorot,
  }));
}
