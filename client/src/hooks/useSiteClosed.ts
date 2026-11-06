import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { api } from '@/services/api';

/**
 * Whether the public site is closed (`SITE_CLOSED=true` on the server).
 *
 * One flag, read from the API, so the client build does not have a copy of it to
 * forget. Until the answer arrives a guest waits, so an open homepage cannot flash
 * and then slam shut.
 */
export function useSiteClosed(): { closed: boolean; pending: boolean } {
  const { data, isPending, isError } = useQuery({
    queryKey: qk.site,
    queryFn: async () => {
      const { data } = await api.get<{ closed: boolean }>('/site');
      return data.closed;
    },
    staleTime: Infinity,
  });

  return { closed: data === true, pending: isPending && !isError };
}
