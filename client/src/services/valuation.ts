import { api } from '@/services/api';

import type {
  Aspect,
  BuildingState,
  Condition,
  Renewal,
} from '@/lib/propertyCondition';

/** What the form sends. Every attribute is optional, and omitted means unknown. */
export interface ValuationInput {
  city: string;
  street?: string;
  neighborhood?: string;
  latitude: number;
  longitude: number;
  gush?: number;
  chelka?: number;
  settlementCode?: number;
  rooms: number;
  area: number;
  attributes: {
    floor?: number;
    topFloor?: number;
    hasLift?: boolean;
    condition?: Condition;
    hasParking?: boolean;
    hasStorage?: boolean;
    hasBalcony?: boolean;
    hasMamad?: boolean;
    aspect?: Aspect;
    buildingState?: BuildingState;
    renewal?: Renewal;
  };
}

export type Verdict = 'good' | 'indicative' | 'too-thin' | 'out-of-scope' | 'no-comps';

export interface ValuationRange {
  low: number;
  high: number;
  expected: number;
  asking: number;
  halfWidth: number;
  widthFromFloor: number;
}

export interface Competitor {
  id: string;
  price: number | null;
  rooms: number | null;
  area: number | null;
  pricePerSqm: number | null;
  daysListed: number | null;
  metres: number;
  hasCutPrice: boolean;
}

export interface ValuationResponse {
  id: string;
  verdict: Verdict;
  range: ValuationRange | null;
  basis: {
    comps: number;
    effective: number;
    spread: number;
    /** `YYYY-MM` — the last month of sale data behind this estimate. */
    asOf: string;
    monthsExtrapolated: number;
    quality: { label: string; factor: number }[];
  };
  market: {
    state: 'buyers' | 'balanced' | 'sellers';
    confident: boolean;
    signals: { label: string; points: 'buyers' | 'balanced' | 'sellers' }[];
    competing: Competitor[];
  };
}

export interface Place {
  settlementCode: number | null;
  settlement?: string;
  latitude?: number;
  longitude?: number;
  deals?: number;
}

/** Where to open the map for a town, from our own recorded sales rather than a geocoder. */
export async function findPlace(city: string): Promise<Place> {
  const { data } = await api.get<Place>('/valuation/place', { params: { city } });
  return data;
}

export interface StreetPoint {
  latitude: number | null;
  longitude: number | null;
}

/**
 * Where a street is, so choosing one can move the map onto it.
 *
 * Nulls are the ordinary answer, not a failure: the register holds 62,000 street
 * names and the server will only place the ones it has already been asked for or can
 * geocode once. When it cannot, the map stays put and the pin is placed by hand,
 * which is how it works with no street chosen at all.
 */
export async function findStreet(city: string, street: string): Promise<StreetPoint> {
  const { data } = await api.get<StreetPoint>('/valuation/street', {
    params: { city, street },
  });
  return data;
}

export async function valueProperty(input: ValuationInput): Promise<ValuationResponse> {
  const { data } = await api.post<ValuationResponse>('/valuation', input);
  return data;
}
