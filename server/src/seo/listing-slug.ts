/**
 * A listing's URL: what it says, and how to read it back.
 *
 * `/nadlan/property/סוקולוב-15-חולון-cmvu0ayux0046xzh0ifihzgx6`. The address is in the
 * URL because that is what somebody searched for and what they see in the result, and
 * the id is on the end because the address is not unique and does not have to be —
 * only the last segment is ever looked up.
 *
 * That split is what lets the address change. A listing corrected from `סוקולב` to
 * `סוקולוב` keeps working on the old URL and is redirected to the new one, so the
 * spelling in a link is never load-bearing.
 */

/** A cuid: lowercase letters and digits, long. Nothing in a Hebrew address looks like one. */
const ID = /^[a-z0-9]{20,}$/u;

export interface Addressable {
  street: string | null;
  houseNumber: number | null;
  neighborhood: string | null;
  city: string | null;
}

/** The URL path for a listing, address first and id last. */
export function listingSlug(id: string, address: Addressable): string {
  const words = [
    address.street,
    address.houseNumber !== null && address.street ? String(address.houseNumber) : null,
    address.city,
  ]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(' ');

  const prefix = words
    .trim()
    .replace(/[\\/?#&=%+]/gu, '')
    .replace(/\s+/gu, '-');

  return prefix ? `${prefix}-${id}` : id;
}

/**
 * The id a slug names.
 *
 * Only the last segment is read, so anything in front of it — an old address, a
 * truncated paste, somebody's own words — is ignored rather than being a reason to
 * 404. A slug that is nothing but an id works too, which is what a link built before
 * the address was known looks like.
 */
export function idFromSlug(slug: string): string {
  const trimmed = slug.trim();
  const last = trimmed.split('-').pop() ?? '';

  return ID.test(last) ? last : trimmed;
}

/** Where a listing's page lives. */
export const listingPath = (id: string, address: Addressable) =>
  `/nadlan/property/${encodeURIComponent(listingSlug(id, address))}`;
