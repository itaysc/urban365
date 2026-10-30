import { useEffect, useMemo, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue } from '@/auth/auth-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { setSessionLostHandler, tryRefresh } from '@/services/api';
import * as authApi from '@/services/auth';
import type { AuthUser } from '@/types/auth';

/**
 * The user is a cache entry under `qk.me`, not a second copy in component state.
 *
 * That is the whole point of the change: anything that writes to the user — renaming an
 * agency, uploading an avatar, approving a claim — invalidates `qk.me` at the mutation
 * site, and every reader updates. Previously each of those had to remember to call
 * `refresh()`, and twice it did not: the dashboard 403'd after self-approval, and a
 * renamed agency kept its old name in the nav.
 *
 * The context stays so `useAuth()` keeps working everywhere; it is now a thin facade
 * over the cache rather than a store of its own.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: qk.me,
    queryFn: authApi.fetchMe,
    // `fetchMe` already turns a 401 into null — being logged out is an answer, not a
    // failure — so there is nothing here worth retrying.
    retry: false,
    // The session outlives any staleness window; writes invalidate it explicitly.
    staleTime: Infinity,
  });

  const user = data ?? null;

  // When a refresh fails for good, drop the user so the guards bounce to /login.
  useEffect(() => {
    // The type argument is not decoration: a query key carries no type of its own, so
    // without it `setQueryData` infers `void` and rejects the value being written.
    setSessionLostHandler(() => queryClient.setQueryData<AuthUser | null>(qk.me, null));
    return () => setSessionLostHandler(null);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    // Writing the response straight into the cache rather than invalidating: login and
    // signup already return the user, so a refetch would be a second round trip for
    // something we are holding.
    // Returns void deliberately. As an expression-bodied arrow it returned whatever
    // `setQueryData` gives back, which made `login` and `signup` resolve to that
    // instead of to void and stopped them matching the context's own type.
    const setUser = (next: AuthUser | null): void => {
      queryClient.setQueryData<AuthUser | null>(qk.me, next);
    };

    const refresh = async () => {
      await queryClient.invalidateQueries({ queryKey: qk.me });
    };

    return {
      user,
      loading: isPending,
      login: async (email, password) => setUser(await authApi.login(email, password)),
      signup: async (input) => setUser(await authApi.signup(input)),
      logout: async () => {
        await authApi.logout().catch(() => undefined);
        setUser(null);
        // Everything else in the cache belongs to the account that just left.
        queryClient.clear();
      },
      refresh,
      recheck: async () => {
        await tryRefresh();
        // The new token may carry a different agency, so every tenant-scoped query is
        // suspect, not just the user.
        await queryClient.invalidateQueries();
      },
    };
  }, [user, isPending, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

