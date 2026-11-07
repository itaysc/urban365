import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/auth-context';
import { qk } from '@/queries/keys';
import { fetchListingPackages } from '@/services/agency';

/** The agency's listing credits. One request, shared by the menu, the editor and checkout. */
export function useListingCredits() {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.listings.packages,
    queryFn: fetchListingPackages,
    enabled: user?.agency?.membershipStatus === 'active',
  });
}
