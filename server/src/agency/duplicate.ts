import type { Prisma } from '@prisma/client';

/**
 * What counts as "the same asset" for an agency.
 *
 * Address alone is not identity: several flats in one building share a street and
 * number, and in this data only 29 of 182 listings carry a house number at all. So the
 * match is built from whatever identifying fields a listing actually has, and is only
 * attempted once there is enough of them to mean something.
 *
 * The result is a *suspected* duplicate, not a verdict. Two genuinely different units
 * can look identical on these fields, so the caller offers an override rather than
 * refusing outright.
 */
export interface DuplicateCandidate {
  section?: string;
  city?: string | null;
  street?: string | null;
  houseNumber?: number | null;
  floor?: number | null;
  rooms?: number | null;
  squareMeter?: number | null;
}

/** Trailing punctuation and double spaces are the usual difference between two typings. */
export function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/\s+/g, ' ').replace(/[.,'"״׳]+$/u, '');
  return cleaned.length > 0 ? cleaned.toLowerCase() : null;
}

/**
 * Enough signal to compare: a city, plus a street or a size, plus at least one of the
 * numbers that separate one unit from another. Without that a check would either never
 * fire or flag every flat in a city.
 */
export function hasEnoughSignal(candidate: DuplicateCandidate): boolean {
  const city = normalizeText(candidate.city);
  if (!city) return false;

  const hasPlace = normalizeText(candidate.street) !== null || candidate.squareMeter != null;
  const hasUnit =
    candidate.houseNumber != null ||
    candidate.floor != null ||
    candidate.rooms != null ||
    candidate.squareMeter != null;

  return hasPlace && hasUnit;
}

/**
 * The filter for a possible duplicate within one agency. Every identifying field the
 * candidate *has* must match; fields it lacks are not constrained, so a sparse listing
 * matches more broadly rather than less.
 *
 * Archived listings are excluded: re-listing a property that was archived is a normal
 * thing to do, not a duplicate.
 */
export function duplicateWhere(
  candidate: DuplicateCandidate,
  agencyId: string,
  excludeId?: string,
): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    agencyId,
    status: { not: 'archived' },
    ...(excludeId ? { id: { not: excludeId } } : {}),
    ...(candidate.section ? { section: candidate.section as 'forsale' | 'rent' | 'commercial' } : {}),
  };

  const city = normalizeText(candidate.city);
  // `equals` with `mode: insensitive` rather than a raw match, so "תל אביב " and
  // "תל אביב" are the same city.
  if (city) where.city = { equals: city, mode: 'insensitive' };

  const street = normalizeText(candidate.street);
  if (street) where.street = { equals: street, mode: 'insensitive' };

  if (candidate.houseNumber != null) where.houseNumber = candidate.houseNumber;
  if (candidate.floor != null) where.floor = candidate.floor;
  if (candidate.rooms != null) where.rooms = candidate.rooms;

  // Sizes are rounded differently by different people, so a few square metres apart is
  // still the same flat.
  if (candidate.squareMeter != null) {
    where.squareMeter = { gte: candidate.squareMeter - 3, lte: candidate.squareMeter + 3 };
  }

  return where;
}
