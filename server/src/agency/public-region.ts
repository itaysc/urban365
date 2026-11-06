import { cityKey } from '../listings/city-name.js';

/**
 * The regions people search by, in the order the directory lists them.
 *
 * The names are `CityBoundary` district names. They must match `REGIONS` in
 * `client/src/data/regions.ts` — a region spelled differently here is a column the
 * directory and the home page disagree about.
 */
export const DIRECTORY_REGIONS: readonly string[] = [
  'מרכז והשרון',
  'תל אביב והסביבה',
  'ירושלים והסביבה',
  'שפלה',
  'חיפה והקריות',
  'חדרה והעמקים',
  'צפון והגליל',
  'דרום',
  'יהודה ושומרון',
];

/** Agencies we cannot place — an office with no city we recognise, or none at all. */
export const OTHER_REGION = 'אזורים נוספים';

export interface CityTally {
  city: string;
  count: number;
}

/**
 * Which district a city name belongs to.
 *
 * A city listed under two districts stays with the one that comes first in
 * `DIRECTORY_REGIONS`, so the directory does not depend on the order the rows
 * happened to come back in.
 */
export function regionIndex(
  districts: { name: string; memberCities: string[] }[],
): Map<string, string> {
  const byName = new Map(districts.map((d) => [d.name, d.memberCities]));
  const ordered = [
    ...DIRECTORY_REGIONS.filter((name) => byName.has(name)),
    ...districts.map((d) => d.name).filter((name) => !DIRECTORY_REGIONS.includes(name)),
  ];

  const index = new Map<string, string>();
  for (const name of ordered) {
    for (const city of byName.get(name) ?? []) {
      const key = cityKey(city);
      if (key && !index.has(key)) index.set(key, name);
    }
  }
  return index;
}

/**
 * The one region an agency is filed under.
 *
 * Listings decide it: the district that holds the most of them. An agency with
 * nothing published falls back to its office, and one we cannot place at all
 * goes under {@link OTHER_REGION} rather than disappearing.
 */
export function primaryRegion(
  listings: CityTally[],
  officeCities: string[],
  regions: Map<string, string>,
): string {
  const tally = new Map<string, number>();
  for (const row of listings) {
    const region = regions.get(cityKey(row.city));
    if (!region) continue;
    tally.set(region, (tally.get(region) ?? 0) + row.count);
  }

  if (tally.size > 0) {
    return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he'))[0][0];
  }

  for (const city of officeCities) {
    const region = regions.get(cityKey(city));
    if (region) return region;
  }

  return OTHER_REGION;
}

/** Directory order: the named regions first, anything else after them. */
export function regionSort(a: string, b: string): number {
  const ai = DIRECTORY_REGIONS.indexOf(a);
  const bi = DIRECTORY_REGIONS.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b, 'he');
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}
