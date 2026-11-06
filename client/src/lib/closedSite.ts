/**
 * Paths a guest may still open while `SITE_CLOSED` is on.
 *
 * The home page stays open because it is in the sitemap. Signing in, recovering a
 * password, accepting an invite, and answering a viewing email all have to work or
 * the closed site has no way in. The legal pages stay because the login form links
 * to them. Everything else goes back to the home page.
 */
const OPEN_WHEN_CLOSED = new Set([
  '/',
  '/login',
  '/agency/login',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
  '/join',
  '/terms',
  '/policy',
  '/privacy',
  '/accessibility',
]);

export function guestMayBrowse(pathname: string): boolean {
  if (OPEN_WHEN_CLOSED.has(pathname)) return true;
  // Token in the path is the authorisation. The customer has never signed in.
  if (pathname.startsWith('/viewing/')) return true;
  return false;
}

/** Self-serve account creation. An invite does not use these paths. */
const SIGNUP_PATHS = ['/signup', '/agency/signup', '/agency/claim'];

export function isSignupPath(pathname: string): boolean {
  return SIGNUP_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
