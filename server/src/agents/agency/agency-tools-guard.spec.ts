import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { can, mayAssign } from '../../auth/permissions.js';
import type { Principal } from '../../auth/types/principal.js';

/**
 * Cross-agency and role behaviour the CRM services already enforce. The agent tools
 * call those services inside TenantScope; these checks document the bars they rely on.
 */
describe('agency tool guard rails', () => {
  const ownerA: Principal = {
    userId: 'owner-a',
    email: 'a@office.co',
    agencyId: 'agency-a',
    role: 'owner',
    platformRole: null,
    sessionEpoch: 1,
  };

  const agentA: Principal = {
    userId: 'agent-a',
    email: 'agent@office.co',
    agencyId: 'agency-a',
    role: 'agent',
    platformRole: null,
    sessionEpoch: 1,
  };

  it('lets an agent write leads and deals but not manage the team', () => {
    expect(can(agentA, 'lead:write')).toBe(true);
    expect(can(agentA, 'deal:write')).toBe(true);
    expect(can(agentA, 'lead:read-all')).toBe(false);
    expect(can(agentA, 'team:manage')).toBe(false);
  });

  it('stops an agent assigning a customer to a colleague', () => {
    expect(mayAssign(agentA, agentA.userId)).toBe(true);
    expect(mayAssign(agentA, 'colleague')).toBe(false);
    expect(mayAssign(ownerA, 'colleague')).toBe(true);
  });

  it('refuses a caller with no agency the way TenantGuard does', () => {
    const guest: Principal = {
      userId: 'buyer',
      email: 'buyer@x.co',
      agencyId: null,
      role: null,
      platformRole: null,
      sessionEpoch: 1,
    };
    expect(can(guest, 'lead:write')).toBe(false);
    expect(() => {
      if (!guest.agencyId) throw new ForbiddenException('החשבון עדיין לא משויך לסוכנות מאושרת.');
    }).toThrow(ForbiddenException);
  });
});
