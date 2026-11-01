import { api } from '@/services/api';
import type { SearchFilters } from '@/types/search';

export interface SavedSearch {
  id: string;
  name: string;
  section: string | null;
  cities: string[];
  propertyTypes: string[];
  minRooms: number | null;
  maxRooms: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  minSquareMeter: number | null;
  alert: boolean;
  lastAlertAt: string | null;
  createdAt: string;
}

export interface SaveSearchInput {
  name: string;
  section?: string;
  cities?: string[];
  propertyTypes?: string[];
  minRooms?: number;
  maxRooms?: number;
  minPrice?: number;
  maxPrice?: number;
  minSquareMeter?: number;
  alert?: boolean;
}

/**
 * The filters the alert can actually act on.
 *
 * Not everything on the search page survives: a free-text query, a neighbourhood and an
 * amenity list are all things the matcher has no column to compare, and carrying them
 * into a saved search would promise a precision the email cannot keep. What is dropped
 * is said on screen rather than quietly discarded.
 */
export function alertableFilters(filters: SearchFilters): Omit<SaveSearchInput, 'name'> {
  return {
    ...(filters.section ? { section: filters.section } : {}),
    ...(filters.city.length > 0 ? { cities: filters.city } : {}),
    ...(filters.propertyType.length > 0 ? { propertyTypes: filters.propertyType } : {}),
    ...(filters.minRooms !== undefined ? { minRooms: filters.minRooms } : {}),
    ...(filters.maxRooms !== undefined ? { maxRooms: filters.maxRooms } : {}),
    ...(filters.minPrice !== undefined ? { minPrice: filters.minPrice } : {}),
    ...(filters.maxPrice !== undefined ? { maxPrice: filters.maxPrice } : {}),
    ...(filters.minSquareMeter !== undefined ? { minSquareMeter: filters.minSquareMeter } : {}),
  };
}

/** What the search page carries that an alert cannot, so it can say so. */
export function droppedFromAlert(filters: SearchFilters): string[] {
  const dropped: string[] = [];
  if (filters.q) dropped.push('חיפוש חופשי');
  if (filters.neighborhood.length > 0) dropped.push('שכונות');
  if (filters.amenities.length > 0) dropped.push('מאפיינים');
  if (filters.district.length > 0) dropped.push('אזורים');
  if (filters.maxSquareMeter !== undefined) dropped.push('שטח מרבי');
  return dropped;
}

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const { data } = await api.get<SavedSearch[]>('/my/searches');
  return data;
}

export async function saveSearch(input: SaveSearchInput): Promise<SavedSearch> {
  const { data } = await api.post<SavedSearch>('/my/searches', input);
  return data;
}

export const updateSavedSearch = (id: string, input: { name?: string; alert?: boolean }) =>
  api.patch<SavedSearch>(`/my/searches/${id}`, input);

export const deleteSavedSearch = (id: string) => api.delete(`/my/searches/${id}`);
