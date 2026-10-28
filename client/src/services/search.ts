import { api } from '@/services/api';
import type { SearchFilters, SearchListing, SearchResponse } from '@/types/search';

/** Only set parameters are sent, so the server's own defaults apply to the rest. */
export function toQueryParams(filters: SearchFilters, withFacets = true): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '' && !Number.isNaN(value)) params.set(key, String(value));
  };

  set('section', filters.section);
  set('agencyId', filters.agencyId);
  set('minPrice', filters.minPrice);
  set('maxPrice', filters.maxPrice);
  set('minRooms', filters.minRooms);
  set('maxRooms', filters.maxRooms);
  set('minSquareMeter', filters.minSquareMeter);
  set('maxSquareMeter', filters.maxSquareMeter);
  set('q', filters.q?.trim() || undefined);
  set('sort', filters.sort);
  set('page', filters.page);

  // The API accepts these comma-separated.
  if (filters.city.length) params.set('city', filters.city.join(','));
  if (filters.propertyType.length) params.set('propertyType', filters.propertyType.join(','));
  if (filters.amenities.length) params.set('amenities', filters.amenities.join(','));

  if (withFacets) params.set('facets', 'true');
  return params;
}

export async function searchListings(filters: SearchFilters): Promise<SearchResponse> {
  const { data } = await api.get<SearchResponse>(`/listings/search?${toQueryParams(filters)}`);
  return data;
}

export async function fetchListing(id: string): Promise<SearchListing & Record<string, unknown>> {
  const { data } = await api.get(`/listings/${id}`);
  return data;
}
