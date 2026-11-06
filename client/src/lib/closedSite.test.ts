import { describe, expect, it } from 'vitest';
import { guestMayBrowse, isSignupPath } from './closedSite';

describe('guestMayBrowse', () => {
  it('keeps the doors a guest still needs', () => {
    for (const path of ['/', '/login', '/agency/login', '/forgot-password', '/accept-invite', '/terms']) {
      expect(guestMayBrowse(path), path).toBe(true);
    }
  });

  it('keeps a viewing link, which is authorised by the token', () => {
    expect(guestMayBrowse('/viewing/abc')).toBe(true);
    expect(guestMayBrowse('/viewing/seller/abc')).toBe(true);
  });

  it('sends the rest of the site back to the home page', () => {
    for (const path of ['/search', '/agencies', '/signup', '/agency/signup', '/mortgage', '/sell']) {
      expect(guestMayBrowse(path), path).toBe(false);
    }
  });
});

describe('isSignupPath', () => {
  it('names the forms that open an account without an invite', () => {
    expect(isSignupPath('/signup')).toBe(true);
    expect(isSignupPath('/agency/signup')).toBe(true);
    expect(isSignupPath('/agency/claim')).toBe(true);
    expect(isSignupPath('/login')).toBe(false);
    expect(isSignupPath('/accept-invite')).toBe(false);
  });
});
