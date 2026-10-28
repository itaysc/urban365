import type { AgencyRole } from '@prisma/client';
import type { Principal } from './types/principal.js';

export type Action =
  | 'listing:write'
  | 'lead:read-all'
  | 'lead:write'
  | 'deal:write'
  | 'team:manage'
  | 'agency:manage';

/**
 * Every role check lives here rather than scattered across controllers. Two roles will
 * become three before long — an office manager who runs the team but not billing — and
 * that is a one-line change only if the decisions are in one file.
 */
const BY_ROLE: Record<AgencyRole, Action[]> = {
  owner: ['listing:write', 'lead:read-all', 'lead:write', 'deal:write', 'team:manage', 'agency:manage'],
  agent: ['listing:write', 'lead:write', 'deal:write'],
};

export function can(principal: Principal | undefined, action: Action): boolean {
  if (!principal) return false;
  if (principal.platformRole === 'admin') return true;
  if (!principal.role) return false;
  return BY_ROLE[principal.role].includes(action);
}
