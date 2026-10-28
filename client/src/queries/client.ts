import { QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';

/**
 * One client for the app.
 *
 * `retry` is deliberately narrow. The axios interceptor already refreshes once on a 401
 * and replays the request, so a retry here would re-run something that has already been
 * handled — and retrying a 403 or a 404 just delays showing the user the truth. Only
 * genuine transport failures and 5xx are worth a second attempt.
 */
const isWorthRetrying = (error: unknown): boolean => {
  if (!(error instanceof AxiosError)) return false;
  const status = error.response?.status;
  // No response at all means the network or the server dropped it.
  return status === undefined || status >= 500;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Half a minute: moving between pages reuses what was just fetched, while a CRM
      // left open does not keep showing this morning's leads.
      staleTime: 30_000,
      // The reason a CRM wants this library — coming back to a tab gets current data.
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => failureCount < 2 && isWorthRetrying(error),
    },
    mutations: {
      // A write is not idempotent in general; replaying one silently is worse than
      // surfacing the failure.
      retry: false,
    },
  },
});
