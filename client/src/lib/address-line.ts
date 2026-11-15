import { ISRAELI_CITIES } from '@/data/cities';
import { splitHouseNumber } from '@/lib/house-number';

/**
 * How well a tail of the line matches a locality.
 *
 * Exact wins ("הרצליה"). A match that ends on a word boundary is next ("תל אביב"
 * against "תל אביב יפו"). A prefix in the middle of the word still counts ("הרצל"
 * against "הרצליה"): "סוקולוב הר" already finds the town, and stopping at "הרצל"
 * would empty the list halfway through typing it.
 */
function cityRank(suffix: string): number {
  if (suffix.length < 2) return 0;
  let rank = 0;
  for (const city of ISRAELI_CITIES) {
    if (city === suffix) return 3;
    if (!city.startsWith(suffix)) continue;
    const next = city[suffix.length];
    rank = Math.max(rank, next === ' ' || next === '-' ? 2 : 1);
  }
  return rank;
}

export interface PlaceParts {
  street: string;
  house: string;
  city: string;
  /** A comma, or a town written after the street with only a space between them. */
  separated: boolean;
  /**
   * The town is only a prefix inside a word. The line may still be a street
   * ("שדרות הרצל"), so that reading is searched as well.
   */
  loose: boolean;
}

/**
 * One address line, comma or not.
 *
 * "סוקולוב, הרצליה" and "סוקולוב הרצליה" are the same place. The town is the longest
 * tail that is one, so "הרצל תל אביב" keeps the street and does not stop at "אביב".
 */
export function splitPlace(value: string): PlaceParts {
  const trimmed = value.trim();
  const comma = trimmed.lastIndexOf(',');
  if (comma >= 0) {
    const { name, house } = splitHouseNumber(trimmed.slice(0, comma));
    return {
      street: name,
      house,
      city: trimmed.slice(comma + 1).trim(),
      separated: true,
      loose: false,
    };
  }

  // The number can sit in the middle ("סוקולוב 12 הרצליה") or at the end
  // ("סוקולוב הרצליה 12"). Peel a trailing one first, then look for the town.
  const tail = splitHouseNumber(trimmed);
  const words = tail.name.split(/\s+/).filter(Boolean);
  let best: PlaceParts & { rank: number; at: number } | null = null;
  for (let i = 1; i < words.length; i++) {
    const city = words.slice(i).join(' ');
    const rank = cityRank(city);
    if (rank === 0) continue;
    const head = splitHouseNumber(words.slice(0, i).join(' '));
    if (!head.name) continue;
    if (!best || rank > best.rank || (rank === best.rank && i < best.at)) {
      best = {
        street: head.name,
        house: head.house || tail.house,
        city,
        separated: true,
        loose: rank === 1,
        rank,
        at: i,
      };
    }
  }
  if (best) {
    return {
      street: best.street,
      house: best.house,
      city: best.city,
      separated: true,
      loose: best.rank === 1,
    };
  }

  if (tail.house) {
    return { street: tail.name, house: tail.house, city: '', separated: false, loose: false };
  }
  return { street: '', house: '', city: trimmed, separated: false, loose: false };
}
