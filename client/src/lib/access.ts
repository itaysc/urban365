import type { AuthUser } from '@/types/auth';

/**
 * The CRM is for platform staff and agency accounts.
 *
 * A regular user has their own page. Opening the agency shell for them would be a
 * dashboard they cannot use.
 */
export function canUseCrm(
  user: Pick<AuthUser, 'platformRole' | 'accountType'> | null | undefined,
): boolean {
  return !!user && (user.platformRole === 'admin' || user.accountType === 'agency');
}
