import { describe, expect, it } from 'vitest';
import { assigneeScope, mayAssign, mayEditListing } from './permissions.js';
import type { Principal } from './types/principal.js';

const base: Principal = {
  userId: 'u-agent',
  email: 'a@example.test',
  agencyId: 'agency-1',
  role: 'agent',
  platformRole: null,
  sessionEpoch: 0,
};
const agent = base;
const owner: Principal = { ...base, userId: 'u-owner', role: 'owner' };
const admin: Principal = { ...base, userId: 'u-admin', role: null, platformRole: 'admin' };

describe('assigneeScope', () => {
  it('limits an agent to their own rows and the unassigned pool', () => {
    expect(assigneeScope(agent, 'assignedToId')).toEqual({
      OR: [{ assignedToId: 'u-agent' }, { assignedToId: null }],
    });
  });

  it('does not limit the owner or a platform admin', () => {
    expect(assigneeScope(owner, 'ownerId')).toEqual({});
    expect(assigneeScope(admin, 'ownerId')).toEqual({});
  });

  it('matches nothing assigned when there is no principal', () => {
    expect(assigneeScope(undefined, 'ownerId')).toEqual({ OR: [{ ownerId: '' }, { ownerId: null }] });
  });
});

describe('mayAssign', () => {
  it('lets an agent take a record or clear it, but not hand it to a colleague', () => {
    expect(mayAssign(agent, 'u-agent')).toBe(true);
    expect(mayAssign(agent, undefined)).toBe(true);
    expect(mayAssign(agent, '')).toBe(true);
    expect(mayAssign(agent, 'u-colleague')).toBe(false);
  });

  it('lets the owner assign anyone', () => {
    expect(mayAssign(owner, 'u-colleague')).toBe(true);
  });
});

describe('mayEditListing', () => {
  it('lets an agent edit only the listings they created', () => {
    expect(mayEditListing(agent, { createdByUserId: 'u-agent' })).toBe(true);
    expect(mayEditListing(agent, { createdByUserId: 'u-colleague' })).toBe(false);
  });

  it('keeps imported listings, which have no creator, for the owner', () => {
    expect(mayEditListing(agent, { createdByUserId: null })).toBe(false);
    expect(mayEditListing(owner, { createdByUserId: null })).toBe(true);
    expect(mayEditListing(admin, { createdByUserId: 'u-colleague' })).toBe(true);
  });

  it('refuses a signed-in user with no agency role', () => {
    expect(mayEditListing({ ...base, role: null }, { createdByUserId: 'u-agent' })).toBe(false);
  });
});
