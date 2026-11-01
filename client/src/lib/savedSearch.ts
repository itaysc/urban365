import type { SavedSearch } from '@/services/searches';
import type { SearchFilters } from '@/types/search';

/**
 * The criteria an alert is made of, in one canonical shape.
 *
 * Both sides have to be reduced to this before they can be compared: the filter bar
 * says `undefined` where the database says `null`, and `["בת ים","חולון"]` is the same
 * search as `["חולון","בת ים"]`. Comparing the two as they arrive would report "not
 * saved yet" for a search that is, which is a worse failure than not comparing at all
 * — the person saves it twice and gets the same email twice.
 */
export interface Criteria {
  section: string | null;
  cities: string[];
  propertyTypes: string[];
  minRooms: number | null;
  maxRooms: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  minSquareMeter: number | null;
}

const list = (values: string[] | undefined): string[] => [...(values ?? [])].sort();
const value = <T,>(v: T | undefined | null): T | null => (v === undefined ? null : v);

/** What the search page is currently asking for, as criteria. */
export function criteriaOfFilters(filters: SearchFilters): Criteria {
  return {
    section: value(filters.section),
    cities: list(filters.city),
    propertyTypes: list(filters.propertyType),
    minRooms: value(filters.minRooms),
    maxRooms: value(filters.maxRooms),
    minPrice: value(filters.minPrice),
    maxPrice: value(filters.maxPrice),
    minSquareMeter: value(filters.minSquareMeter),
  };
}

/** What a stored search is asking for, as the same thing. */
export function criteriaOfSaved(search: SavedSearch): Criteria {
  return {
    section: search.section,
    cities: list(search.cities),
    propertyTypes: list(search.propertyTypes),
    minRooms: search.minRooms,
    maxRooms: search.maxRooms,
    minPrice: search.minPrice,
    maxPrice: search.maxPrice,
    minSquareMeter: search.minSquareMeter,
  };
}

export function sameCriteria(a: Criteria, b: Criteria): boolean {
  return (
    a.section === b.section &&
    a.minRooms === b.minRooms &&
    a.maxRooms === b.maxRooms &&
    a.minPrice === b.minPrice &&
    a.maxPrice === b.maxPrice &&
    a.minSquareMeter === b.minSquareMeter &&
    a.cities.length === b.cities.length &&
    a.cities.every((city, i) => city === b.cities[i]) &&
    a.propertyTypes.length === b.propertyTypes.length &&
    a.propertyTypes.every((type, i) => type === b.propertyTypes[i])
  );
}

/** The saved search matching what is on screen, if there is one. */
export function alreadySaved(
  filters: SearchFilters,
  searches: SavedSearch[] | undefined,
): SavedSearch | undefined {
  const current = criteriaOfFilters(filters);
  return (searches ?? []).find((search) => sameCriteria(current, criteriaOfSaved(search)));
}
