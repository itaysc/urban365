import { createContext, useContext } from 'react';
import type { AuthUser, SignupInput } from '@/types/auth';

export interface AuthContextValue {
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
  /** Act as another account. The caller decides where to go afterwards. */
  impersonate: (userId: string) => Promise<AuthUser>;
  /** Back to the admin account that started it. */
  stopImpersonating: () => Promise<AuthUser>;
}

/**
 * Held apart from the provider on purpose.
 *
 * A module that exports a component alongside a hook and a context cannot be hot
 * replaced cleanly: editing it — or anything it imports — builds a *new* context
 * object, while components already mounted still hold the old one, and every
 * `useContext` on it returns null. That surfaces as "useAuth must be used inside
 * <AuthProvider>" on a page that is plainly inside one, and goes away on a hard reload,
 * which is how it hides.
 *
 * With the context in a module of its own, replacing the provider leaves the identity
 * everyone reads from untouched.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
