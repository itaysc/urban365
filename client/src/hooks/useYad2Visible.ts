import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/auth-context';
import { qk } from '@/queries/keys';
import { api } from '@/services/api';

/**
 * Whether this viewer may see yad2 — the importer, and every mention of it.
 *
 * A platform admin always may, whatever the server flag says. Everyone else follows
 * `YAD2_FOR_AGENCIES`. Until that answer arrives the mention stays hidden, so a flag
 * of `false` cannot flash the word and then take it away.
 */
export function useYad2Visible(): boolean {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: qk.yad2ForAgencies,
    queryFn: async () => {
      const { data } = await api.get<{ enabled: boolean }>('/yad2/for-agencies');
      return data.enabled;
    },
    staleTime: Infinity,
  });

  if (user?.platformRole === 'admin') return true;
  return data === true;
}
