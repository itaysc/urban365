import type { SearchFilters } from '@/types/search';

type Places = Pick<SearchFilters, 'section' | 'city' | 'neighborhood'>;

/** What is being searched for, as the heading says it. */
const SECTION_PHRASE: Record<string, string> = {
  forsale: 'נדל״ן למכירה',
  rent: 'נדל״ן להשכרה',
  commercial: 'נדל״ן מסחרי',
};

/**
 * The one place being searched, or null when it is none or several.
 *
 * Choosing a neighbourhood also selects its city, so one neighbourhood beside one city
 * is still a single place and reads as "נאות רחל, חולון". Two cities is not, and no
 * phrase naming both is shorter or clearer than saying there are several.
 */
export function singlePlace({ city, neighborhood }: Places): string | null {
  if (neighborhood.length === 1 && city.length <= 1) {
    return city.length === 1 ? `${neighborhood[0]}, ${city[0]}` : neighborhood[0];
  }
  if (neighborhood.length === 0 && city.length === 1) return city[0];
  return null;
}

/**
 * The page heading: "נדל״ן למכירה בחולון".
 *
 * The בּ prefix attaches directly to the name — `בחולון`, `בבת ים` — which is why this
 * builds the string rather than printing the place in a separate element.
 */
export function searchTitle(filters: Places): string {
  const what = SECTION_PHRASE[filters.section ?? 'forsale'] ?? SECTION_PHRASE.forsale;
  const place = singlePlace(filters);

  if (place) return `${what} ב${place}`;
  if (filters.city.length > 0 || filters.neighborhood.length > 0) {
    return `${what} במיקומים שנבחרו`;
  }
  return what;
}
