import { assertBootConfig } from './assert-boot-config.js';
import { normalizeEmail } from './normalize-email.js';
import { can } from './permissions.js';
import type { Principal } from './types/principal.js';

const principal = (over: Partial<Principal> = {}): Principal => ({
  userId: 'u1',
  email: 'a@b.com',
  agencyId: 'ag1',
  role: 'agent',
  platformRole: null,
  sessionEpoch: 0,
  ...over,
});

describe('normalizeEmail', () => {
  it('lowercases and trims, so one address cannot become two accounts', () => {
    expect(normalizeEmail('  Owner@Example.COM ')).toBe('owner@example.com');
  });
});

describe('permissions', () => {
  it('lets an owner manage the team but not an agent', () => {
    expect(can(principal({ role: 'owner' }), 'team:manage')).toBe(true);
    expect(can(principal({ role: 'agent' }), 'team:manage')).toBe(false);
  });

  it('keeps an agency\'s own details to an owner', () => {
    // The agency page, its branches and the team are what the public sees and who can
    // act for the agency. An agent sells; they do not get to rename the business.
    expect(can(principal({ role: 'owner' }), 'agency:manage')).toBe(true);
    expect(can(principal({ role: 'agent' }), 'agency:manage')).toBe(false);
  });

  it('lets both roles write listings', () => {
    expect(can(principal({ role: 'owner' }), 'listing:write')).toBe(true);
    expect(can(principal({ role: 'agent' }), 'listing:write')).toBe(true);
  });

  it('refuses a user whose membership is still pending (no role)', () => {
    expect(can(principal({ role: null }), 'listing:write')).toBe(false);
  });

  it('refuses an anonymous caller', () => {
    expect(can(undefined, 'listing:write')).toBe(false);
  });

  it('lets a platform admin through regardless of agency role', () => {
    expect(can(principal({ role: null, platformRole: 'admin' }), 'agency:manage')).toBe(true);
  });
});

describe('assertBootConfig', () => {
  const good = 'K3n8Qw2ZpL9vR4tYbX7mA1sD6fG0hJcV';

  it('throws in production on a weak JWT secret', () => {
    expect(() =>
      assertBootConfig({ nodeEnv: 'production', jwtSecret: 'secret', corsOrigins: ['https://a.com'] }),
    ).toThrow(/JWT_SECRET/);
  });

  it('throws in production when CORS is wide open, since cookies are credentialed', () => {
    expect(() =>
      assertBootConfig({ nodeEnv: 'production', jwtSecret: good, corsOrigins: ['*'] }),
    ).toThrow(/CORS_ORIGINS/);
  });

  it('only warns in development, so a fresh checkout still boots', () => {
    expect(() =>
      assertBootConfig({ nodeEnv: 'development', jwtSecret: 'weak', corsOrigins: ['*'] }),
    ).not.toThrow();
  });

  it('passes on a sound configuration', () => {
    expect(() =>
      assertBootConfig({ nodeEnv: 'production', jwtSecret: good, corsOrigins: ['https://a.com'] }),
    ).not.toThrow();
  });
});
