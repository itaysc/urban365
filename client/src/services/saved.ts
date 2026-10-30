import { api } from '@/services/api';
import type { SearchListing } from '@/types/search';

export interface SaveResult {
  saved: boolean;
  savedCount: number;
}

/**
 * Saving works signed out. The server answers an anonymous caller by issuing an
 * httpOnly cookie naming the browser, and folds those saves into an account if one is
 * ever made — so nothing here has to know whether anybody is signed in.
 */
export async function fetchSavedAmong(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data } = await api.get<{ saved: string[] }>(
    `/saves/among?ids=${encodeURIComponent(ids.join(','))}`,
  );
  return new Set(data.saved);
}

export async function saveListing(listingId: string): Promise<SaveResult> {
  const { data } = await api.post<SaveResult>('/saves', { listingId });
  return data;
}

export async function unsaveListing(listingId: string): Promise<SaveResult> {
  const { data } = await api.delete<SaveResult>(`/saves/${listingId}`);
  return data;
}

/** Everything the caller has saved — account or signed-out browser alike. */
export async function fetchSavedListings(): Promise<SearchListing[]> {
  const { data } = await api.get<{ items: SearchListing[] }>('/saves');
  return data.items;
}
