import { useEffect, useRef, useState } from 'react';
import { searchListings } from '@/services/search';
import type { SearchFilters, SearchResponse } from '@/types/search';

interface State {
  status: 'idle' | 'loading' | 'done' | 'error';
  data: SearchResponse | null;
  error: string | null;
}

export function useListingSearch(filters: SearchFilters) {
  const [state, setState] = useState<State>({ status: 'idle', data: null, error: null });
  const runId = useRef(0);

  // Serialised so the effect re-runs on a real filter change, not on every render.
  const key = JSON.stringify(filters);

  useEffect(() => {
    const id = ++runId.current;
    // Keep the previous results on screen while the next page loads, so the grid
    // does not collapse and bounce the scroll position on every keystroke.
    setState((s) => ({ ...s, status: 'loading', error: null }));

    searchListings(filters)
      .then((data) => {
        if (id === runId.current) setState({ status: 'done', data, error: null });
      })
      .catch((e: unknown) => {
        if (id === runId.current) {
          setState({ status: 'error', data: null, error: e instanceof Error ? e.message : String(e) });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
