import { api } from '@/services/api';

export interface HistoryYear {
  year: number;
  count: number;
  median: number;
  perSqm: number | null;
}

export interface HistorySale {
  date: string;
  amount: number;
  rooms: number | null;
  area: number | null;
  perSqm: number | null;
  nature: string | null;
}

export interface MarketHistory {
  ok: true;
  city: string;
  street: string;
  radiusMetres: number;
  years: number;
  rooms: number | null;
  truncated: boolean;
  cappedAt: number | null;
  total: number;
  byYear: HistoryYear[];
  sales: HistorySale[];
  salesTotal: number;
  asking: { count: number; median: number; perSqm: number | null } | null;
}

export type MarketHistoryMiss =
  | { ok: false; reason: 'city' }
  | { ok: false; reason: 'street'; choices: string[] }
  | { ok: false; reason: 'point'; street: string };

export type MarketHistoryResponse = MarketHistory | MarketHistoryMiss;

export async function fetchMarketHistory(query: {
  city: string;
  street: string;
  rooms?: number;
  years?: number;
  year?: number;
}): Promise<MarketHistoryResponse> {
  const { data } = await api.get<MarketHistoryResponse>('/valuation/history', { params: query });
  return data;
}
