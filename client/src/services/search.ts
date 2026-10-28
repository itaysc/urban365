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

// ── map ───────────────────────────────────────────────────────────────────────

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  price: number | null;
  rooms: number | null;
  propertyType: string | null;
  city: string | null;
  street: string | null;
  coverImageUrl: string | null;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface MapResponse {
  points: MapPoint[];
  /** True when the point cap was hit, so the view is a subset rather than everything. */
  truncated: boolean;
}

/**
 * Pins for the current filters. Takes the same query string as the list so the two
 * views never disagree about what is being searched; paging is irrelevant to a map and
 * is left out.
 */
export async function fetchMapPoints(
  filters: SearchFilters,
  bounds?: MapBounds,
): Promise<MapResponse> {
  const params = new URLSearchParams(toQueryParams(filters));
  params.delete('page');
  params.delete('pageSize');
  params.delete('facets');

  if (bounds) {
    for (const [key, value] of Object.entries(bounds)) params.set(key, String(value));
  }

  const { data } = await api.get<MapResponse>(`/listings/map?${params.toString()}`);
  return data;
}
