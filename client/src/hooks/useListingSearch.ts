import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { searchListings } from '@/services/search';
import type { SearchFilters, SearchResponse } from '@/types/search';

interface State {
  status: 'idle' | 'loading' | 'done' | 'error';
  data: SearchResponse | null;
  error: string | null;
}

/**
 * The same shape the page already consumes, now backed by the cache.
 *
 * `keepPreviousData` is what the hand-rolled version used a `runId` ref for: the last
 * results stay on screen while the next page loads, so the grid does not collapse and
 * throw the scroll position on every keystroke. Out-of-order responses are handled by
 * the cache keying on filters rather than by comparing ids.
 */
export function useListingSearch(filters: SearchFilters): State {
  const { data, isPending, isError, error } = useQuery({
    queryKey: qk.listings.search(filters),
    queryFn: () => searchListings(filters),
    placeholderData: keepPreviousData,
  });

  if (isError) {
    return { status: 'error', data: null, error: error instanceof Error ? error.message : String(error) };
  }

  if (isPending) return { status: 'loading', data: null, error: null };

  return { status: 'done', data: data ?? null, error: null };
}
