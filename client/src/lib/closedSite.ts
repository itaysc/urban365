/**
 * Paths a guest may still open while `SITE_CLOSED` is on.
 *
 * The home page stays open because it is in the sitemap. The agency directory and
 * the mortgage calculator stay open because the bar on that page links to them.
 * Signing in, recovering a password,
 * accepting an invite, and answering a viewing email all have to work or the closed
 * site has no way in. Agency signup stays open too: offices are invited in by email
 * and land on that form. A private account is still invite-only. The legal pages
 * stay because the login form links to them. Everything else goes back to the home page.
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
  // The same for an invited office's private preview.
  if (pathname.startsWith('/preview/')) return true;
  // The public list of offices, and each office. Linked from the home page.
  if (pathname === '/agencies' || pathname.startsWith('/agencies/')) return true;
  // The calculator in the same bar.
  if (pathname === '/mortgage' || pathname.startsWith('/mortgage/')) return true;
  // An invited office opens an account here. Buyer signup stays shut.
  if (pathname === '/agency/signup' || pathname.startsWith('/agency/signup/')) return true;
  return false;
}

/** Self-serve account creation. An invite does not use these paths. */
const SIGNUP_PATHS = ['/signup', '/agency/signup', '/agency/claim'];

export function isSignupPath(pathname: string): boolean {
  return SIGNUP_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
