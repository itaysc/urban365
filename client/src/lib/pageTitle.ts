/** What the tab says after the page's own name. */
export const BRAND = 'Urban365';

/**
 * The title for a path, or null when the page sets its own.
 *
 * A table rather than a `useDocumentTitle` call in every page component: twenty-odd
 * pages would mean twenty-odd near-identical lines, and the one that gets forgotten is
 * invisible — a wrong tab title looks exactly like a page nobody got round to.
 *
 * Only the results page at `/search` is missing from here, because its title is the
 * search: "נדל״ן למכירה בחולון" is not something a path can know. It sets its own, and
 * this returns null so the two never fight over it.
 */
const TITLES: Record<string, string> = {
  '/': 'נדל״ן למכירה ולהשכרה בישראל',
  '/agencies': 'סוכנויות נדל״ן',
  '/saved': 'נכסים שמורים',
  '/mortgage': 'מחשבון משכנתא',
  '/valuation': 'הערכת שווי',
  '/alerts': 'חיפושים שמורים',
  '/terms': 'תנאי שימוש',
  '/policy': 'מדיניות פרטיות',
  '/accessibility': 'הצהרת נגישות',
  '/login': 'כניסה',
  '/signup': 'הרשמה',
  '/agency/login': 'כניסה לסוכנויות',
  '/agency/signup': 'הרשמת סוכנות',
  '/agency/claim': 'חיבור הסוכנות',
  '/forgot-password': 'איפוס סיסמה',
  '/join': 'הצטרפות',
  '/reset-password': 'איפוס סיסמה',

  '/app': 'סקירה',
  '/app/radar': 'הזדמנויות',
  '/app/cobrokerage': 'שיתופי פעולה',
  '/app/listings': 'הנכסים שלי',
  '/app/listings/new': 'נכס חדש',
  '/app/leads': 'פניות',
  '/app/customers': 'לקוחות',
  '/app/calendar': 'יומן',
  '/app/deals': 'עסקאות',
  '/app/agency': 'עמוד הסוכנות',
  '/app/team': 'צוות',
  '/app/profile': 'הפרופיל שלי',
  '/app/pending': 'ממתין לאישור',

  '/account': 'החשבון שלי',
  '/sell': 'פרסום נכס',
  '/my-sale': 'הנכסים שלי',
  '/admin/moderation': 'ניהול פלטפורמה',
};

/** Paths with a parameter on the end, matched by their stem. */
const PREFIXES: [string, string][] = [
  ['/app/listings/', 'עריכת נכס'],
  ['/agency/', 'עמוד הסוכנות'],
  ['/viewing/', 'אישור ביקור'],
];

export function titleForPath(pathname: string): string | null {
  // Trailing slashes come from hand-typed urls and would miss every exact match.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  /*
   * The results page names itself, because its title *is* the search and that lives in
   * the query string rather than the path. The home page is an ordinary entry in the
   * table below, which it was not while it was the results page.
   */
  if (path === '/search' || path.startsWith('/agencies/')) return null;
  if (TITLES[path]) return TITLES[path];

  for (const [prefix, title] of PREFIXES) {
    if (path.startsWith(prefix)) return title;
  }

  return null;
}

/** `נכסים שמורים · Urban365`, or just the brand where the page has no name. */
export function documentTitle(pageTitle: string | null): string {
  return pageTitle ? `${pageTitle} · ${BRAND}` : BRAND;
}
