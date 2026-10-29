import { api } from '@/services/api';

/**
 * Which of these listings the signed-in person has saved.
 *
 * One call for a whole set rather than one per card: the map sends every pin in view,
 * and a request each would be hundreds.
 */
export async function fetchSavedAmong(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data } = await api.get<{ saved: string[] }>(
    `/me/saved/among?ids=${encodeURIComponent(ids.join(','))}`,
  );
  return new Set(data.saved);
}

export async function saveListing(listingId: string): Promise<void> {
  await api.post('/me/saved', { listingId });
}

export async function unsaveListing(listingId: string): Promise<void> {
  await api.delete(`/me/saved/${listingId}`);
}
