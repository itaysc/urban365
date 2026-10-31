import { cityKey } from '../listings/city-name.js';

/**
 * What a customer said they are looking for.
 *
 * Every field is optional, and an absent one means "did not say" rather than "does not
 * mind" — the difference matters for scoring, but not for matching: nothing unstated
 * can rule a property out.
 */
export interface Brief {
  lookingSection: string | null;
  lookingCities: string[];
  lookingTypes: string[];
  minRooms: number | null;
  maxRooms: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  minSquareMeter: number | null;
}

/** The parts of a listing a brief is compared against. */
export interface Candidate {
  section: string;
  city: string | null;
  propertyType: string | null;
  rooms: number | null;
  price: number | null;
  squareMeter: number | null;
}

export interface Match {
  /**
   * 0–100: how strong the evidence is, not how urgent the task.
   *
   * A brief that says "anything in Holon" matches half the city, and an agent who is
   * shown that beside a brief naming four rooms, a price range and a type has no way to
   * tell which is worth acting on. So the score counts how much the customer committed
   * to and how much of it was met, rather than being a yes with a number attached.
   */
  score: number;
  /** Why, in the words an agent reads. Built from what was compared, never generated. */
  reason: string;
}

const n = (value: number) => value.toLocaleString('he-IL');

/**
 * Does this property fit what this person asked for?
 *
 * The rule is "nothing stated is contradicted". A missing field on the *listing* side
 * is treated the same way as a missing one on the brief — a scraped row with no square
 * metreage is not evidence that it is too small, and refusing to match it would hide
 * most of the inventory behind data nobody has filled in. The agent sees the listing
 * and can tell.
 *
 * Returns null when something the customer said is contradicted, which is the only
 * thing that disqualifies a property.
 */
export function matchBrief(brief: Brief, listing: Candidate): Match | null {
  // Counted rather than collected, because the score is about how specific the brief
  // was: five criteria met is a much better match than one, on the same property.
  let stated = 0;
  const reasons: string[] = [];

  if (brief.lookingSection) {
    stated += 1;
    if (brief.lookingSection !== listing.section) return null;
  }

  if (brief.lookingCities.length > 0) {
    stated += 1;
    const wanted = brief.lookingCities.map(cityKey);
    // Through `cityKey` on both sides: a brief typed as תל אביב and a listing scraped as
    // תל־אביב–יפו are the same place, and a direct comparison says they are not.
    if (!listing.city || !wanted.includes(cityKey(listing.city))) return null;
    reasons.push(listing.city);
  }

  if (brief.lookingTypes.length > 0) {
    stated += 1;
    if (!listing.propertyType || !brief.lookingTypes.includes(listing.propertyType)) return null;
    reasons.push(listing.propertyType);
  }

  if (brief.minRooms !== null || brief.maxRooms !== null) {
    stated += 1;
    if (listing.rooms !== null) {
      if (brief.minRooms !== null && listing.rooms < brief.minRooms) return null;
      if (brief.maxRooms !== null && listing.rooms > brief.maxRooms) return null;
      reasons.push(`${listing.rooms} חדרים`);
    }
  }

  if (brief.minPrice !== null || brief.maxPrice !== null) {
    stated += 1;
    if (listing.price !== null) {
      if (brief.minPrice !== null && listing.price < brief.minPrice) return null;
      if (brief.maxPrice !== null && listing.price > brief.maxPrice) return null;
      reasons.push(`${n(listing.price)} ₪`);
    }
  }

  if (brief.minSquareMeter !== null) {
    stated += 1;
    if (listing.squareMeter !== null) {
      if (listing.squareMeter < brief.minSquareMeter) return null;
      reasons.push(`${listing.squareMeter} מ״ר`);
    }
  }

  // A brief with nothing in it matches everything, which is not a match — it is an
  // empty form. Saying so here keeps the sweep from burying an agent on day one.
  if (stated === 0) return null;

  return {
    // 50 for fitting at all, and 10 a criterion: a brief naming five things that all
    // fit reaches 100, and "anything in Holon" stays at 60 where it belongs.
    score: Math.min(100, 50 + stated * 10),
    reason:
      reasons.length > 0
        ? `תואם לבקשה: ${reasons.join(' · ')}`
        : 'תואם לבקשה',
  };
}

/** A match found by the sweep, before it is anything in the database. */
export interface FoundMatch {
  customerId: string;
  listingId: string;
  score: number;
}

/**
 * Which of the matches found are worth raising, and in what order.
 *
 * Two caps, both for the same reason: the radar is the few things worth doing today,
 * and a list nobody can read is a list nobody reads. The per-customer one is the
 * important half — without it a single vague brief ("anything in Holon") takes the
 * whole agency's allowance and buries every other customer.
 *
 * `seen` is applied first, which is what makes a cap mean "three new ones" rather than
 * "three at all": the same strongest matches would otherwise take a customer's
 * allowance on every sweep forever, so somebody who dealt with all three would never
 * be offered a fourth.
 */
export function shortlistMatches<T extends FoundMatch>(
  found: T[],
  seen: (match: T) => boolean,
  limits: { perCustomer: number; total: number },
): T[] {
  // Best first, so the caps keep the strongest rather than whatever came first.
  const ordered = [...found].sort((a, b) => b.score - a.score);

  const taken = new Map<string, number>();
  const shortlist: T[] = [];

  for (const match of ordered) {
    if (shortlist.length >= limits.total) break;
    if (seen(match)) continue;

    const already = taken.get(match.customerId) ?? 0;
    if (already >= limits.perCustomer) continue;

    taken.set(match.customerId, already + 1);
    shortlist.push(match);
  }

  return shortlist;
}
