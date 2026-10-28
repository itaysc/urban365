import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setSessionLostHandler, tryRefresh } from '@/services/api';
import * as authApi from '@/services/auth';
import type { AuthUser, SignupInput } from '@/types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the first /auth/me resolves, so guards do not redirect prematurely. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads the user. Cheap; does not touch the session. */
  refresh: () => Promise<void>;
  /**
   * Rotates the access token first, then re-reads the user.
   *
   * The access token carries the agency membership status it was minted with, and
   * `TenantGuard` trusts it — so after an admin approves a claim, `/auth/me` reports
   * `active` (it reads the database) while every tenant route still 403s against the
   * stale token. Rotating first is what makes an approval take effect now instead of
   * whenever the token happens to expire.
   */
  recheck: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * One source of truth. The reference project mirrors its store into React state and then
 * silently stops propagating updates; this keeps the user in exactly one place.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setUser(await authApi.fetchMe());
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  // When a refresh fails for good, drop the user so the guards bounce to /login.
  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
    return () => setSessionLostHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => setUser(await authApi.login(email, password)),
      signup: async (input) => setUser(await authApi.signup(input)),
      logout: async () => {
        await authApi.logout().catch(() => undefined);
        setUser(null);
      },
      refresh,
      recheck: async () => {
        await tryRefresh();
        await refresh();
      },
    }),
    [user, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
