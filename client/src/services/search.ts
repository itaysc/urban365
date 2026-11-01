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
  if (filters.isNew) params.set('isNew', 'true');
  set('sort', filters.sort);
  set('page', filters.page);

  // The API accepts these comma-separated.
  if (filters.city.length) params.set('city', filters.city.join(','));
  if (filters.neighborhood.length) params.set('neighborhood', filters.neighborhood.join(','));
  if (filters.district.length) params.set('district', filters.district.join(','));
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
  floor: number | null;
  squareMeter: number | null;
  propertyType: string | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  coverImageUrl: string | null;
  isExclusive: boolean;
  savedCount: number;
  agencyName: string | null;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface CityBoundary {
  name: string;
  /** A GeoJSON Polygon or MultiPolygon. */
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  bounds: MapBounds;
}

/** An agency office, drawn on the map under the agency's own name. */
export interface MapOffice {
  id: string;
  label: string | null;
  city: string;
  street: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  agencyId: string;
  agencyName: string;
  agencySlug: string | null;
  logoUrl: string | null;
}

export interface MapResponse {
  /** The outline of the searched area, when exactly one city is filtered on. */
  boundary: CityBoundary | null;
  points: MapPoint[];
  /** Offices of the agencies whose listings are in this result. */
  offices: MapOffice[];
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

// ── place suggestions ─────────────────────────────────────────────────────────

export interface CitySuggestion {
  value: string;
  /** How many listings we hold there. Zero for a city we only know the outline of. */
  count: number;
}

export interface NeighborhoodSuggestion {
  value: string;
  /** Travels with the suggestion because a neighbourhood name is unique only inside its city. */
  city: string;
  count: number;
}

export interface DistrictSuggestion {
  value: string;
  count: number;
}

export interface PlaceSuggestions {
  districts: DistrictSuggestion[];
  cities: CitySuggestion[];
  neighborhoods: NeighborhoodSuggestion[];
}

export async function fetchPlaceSuggestions(q: string, section?: string): Promise<PlaceSuggestions> {
  const params = new URLSearchParams({ q });
  if (section) params.set('section', section);
  const { data } = await api.get<PlaceSuggestions>(`/listings/suggest?${params}`);
  return data;
}

/** The city a coordinate falls in, or null when it is outside every boundary we hold. */
export async function fetchCityAt(lat: number, lng: number): Promise<string | null> {
  const { data } = await api.get<{ city: string | null }>(`/listings/city-at?lat=${lat}&lng=${lng}`);
  return data.city;
}

/**
 * The neighbourhoods we hold listings in, inside one city.
 *
 * For the publish form, where the city is already known. Whatever comes back is a
 * suggestion, not a closed list — a new development has a name before it has listings.
 */
export async function fetchNeighborhoodsIn(city: string, q: string): Promise<string[]> {
  const params = new URLSearchParams({ city });
  if (q) params.set('q', q);
  const { data } = await api.get<string[]>(`/listings/neighborhoods?${params}`);
  return data;
}

/**
 * The streets of one city, from the Interior Ministry's register.
 *
 * Asked of the server rather than bundled: 62,000 streets is a megabyte, and a form
 * needs eight of them at a time.
 */
export async function fetchStreetsIn(city: string, q: string): Promise<string[]> {
  const params = new URLSearchParams({ city });
  if (q) params.set('q', q);
  const { data } = await api.get<string[]>(`/listings/streets?${params}`);
  return data;
}

// ── the site's cities, for the footer ────────────────────────────────────────

export interface CityLink {
  city: string;
  /** The city's name as it appears in a landing-page URL. */
  slug: string;
  counts: { forsale: number; rent: number; commercial: number };
}

/**
 * Every city we hold listings in, biggest first.
 *
 * The same directory the server-rendered landing pages are built from, so the footer
 * here and the footer there cannot drift apart.
 */
export async function fetchCityLinks(): Promise<CityLink[]> {
  const { data } = await api.get<CityLink[]>('/cities');
  return data;
}
