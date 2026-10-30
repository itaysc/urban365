import type { Section } from '@/types/yad2';

export const SORTS = [
  'newest',
  'oldest',
  'price-asc',
  'price-desc',
  'price-per-sqm-asc',
  'price-per-sqm-desc',
  'rooms-asc',
  'rooms-desc',
  'size-asc',
  'size-desc',
] as const;

export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  newest: 'החדשות ביותר',
  oldest: 'הוותיקות ביותר',
  'price-asc': 'מחיר — מהזול ליקר',
  'price-desc': 'מחיר — מהיקר לזול',
  'price-per-sqm-asc': 'מחיר למ״ר — עולה',
  'price-per-sqm-desc': 'מחיר למ״ר — יורד',
  'rooms-asc': 'חדרים — עולה',
  'rooms-desc': 'חדרים — יורד',
  'size-asc': 'שטח — עולה',
  'size-desc': 'שטח — יורד',
};

export const SECTION_LABELS: Record<Section, string> = {
  forsale: 'מכירה',
  rent: 'השכרה',
  commercial: 'מסחרי',
};

export interface SearchListing {
  /** Our own id, and the public identifier. Stable for every listing. */
  id: string;
  /** yad2's ad token — null for listings created here rather than scraped. */
  token: string | null;
  listingUrl: string | null;
  section: string;
  price: number | null;
  priceBeforeDrop: number | null;
  pricePerSquareMeter: number | null;
  propertyType: string | null;
  rooms: number | null;
  floor: number | null;
  buildingTopFloor: number | null;
  squareMeter: number | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  houseNumber: number | null;
  latitude: number | null;
  longitude: number | null;
  amenities: string[];
  tags: string[];
  coverImageUrl: string | null;
  imagesCount: number;
  isNewFromDeveloper: boolean;
  /** How many people have saved it. */
  savedCount: number;
  brokerName: string | null;
  agency: { id: string; name: string };
  updatedAt: string | null;
  delistedAt: string | null;
}

export interface Facet {
  value: string;
  count: number;
}

export interface SearchResponse {
  items: SearchListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets?: { cities: Facet[]; propertyTypes: Facet[]; amenities: Facet[] };
}

/** Mirrors the query parameters the search endpoint accepts. */
export interface SearchFilters {
  section?: Section;
  agencyId?: string;
  city: string[];
  neighborhood: string[];
  /** Regions — "מרכז והשרון". The server expands each to the cities it covers. */
  district: string[];
  propertyType: string[];
  amenities: string[];
  minPrice?: number;
  maxPrice?: number;
  minRooms?: number;
  maxRooms?: number;
  minSquareMeter?: number;
  maxSquareMeter?: number;
  q?: string;
  /** Only developer-sold apartments. Absent means all of them, new or not. */
  isNew?: boolean;
  sort: Sort;
  page: number;
}

export const EMPTY_FILTERS: SearchFilters = {
  section: 'forsale',
  city: [],
  neighborhood: [],
  district: [],
  propertyType: [],
  amenities: [],
  sort: 'newest',
  page: 1,
};
