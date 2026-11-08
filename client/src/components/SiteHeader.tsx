import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, Heart, Menu, Plus, X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { Avatar } from '@/components/ui/Avatar';
import { qk } from '@/queries/keys';
import { fetchSavedCount } from '@/services/saved';
import { canUseCrm } from '@/lib/access';
import { fetchMyListings } from '@/services/seller';

/** Shared by the link and the button, which are the same control in two states. */
const publishClass =
  'flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900';

interface Props {
  /** Put beside the logo. The dashboard's drawer trigger lives here on a phone. */
  leading?: ReactNode;
  /** Said beside the logo — the agency name, on the pages that belong to one. */
  subtitle?: ReactNode;
  /**
   * Edge to edge. On by default, so the bar lines up on every page — a capped bar on
   * the public pages sat inboard of the one over the dashboard. Pass false only for a
   * page whose content is deliberately narrower than the window and the bar should
   * follow it.
   */
  fullWidth?: boolean;
}

/**
 * The bar across the top of every page.
 *
 * One component rather than a copy per page: the saved count, the publish entry and
 * who is signed in have to agree everywhere, and a copy per page is a place for them
 * to stop agreeing. The agency dashboard passes its own drawer trigger and agency name
 * through rather than keeping a second header of its own.
 */
/**
 * The rule between two navigation items.
 *
 * `aria-hidden` because it is punctuation for the eye only: a screen reader already
 * hears three separate links and would otherwise hear a stray "vertical line" between
 * each pair. Lighter than the words it separates, so it divides without competing.
 */
const NavBar = () => (
  <span aria-hidden="true" className="text-sm text-slate-300">
    |
  </span>
);

/** Same treatment as Yad2: a light wash behind the word, the word itself staying dark. */
const navLink =
  'rounded-lg px-2.5 py-1.5 text-base text-slate-600 transition hover:bg-slate-100 hover:text-slate-900';

type LoginIntent = 'account' | 'sell' | 'valuation';

/**
 * What each sign-in was asked for: what to say, and where to carry on to.
 *
 * Signing in for its own sake has neither — no reason to give and nowhere to go, so
 * the dialog's own wording stands and the page stays where it is.
 */
const ASKED_FOR: Record<LoginIntent, { because?: string; then?: string }> = {
  account: {},
  sell: { because: 'פרסום נכס פתוח למשתמשים רשומים', then: '/sell/new' },
  valuation: { because: 'הערכת שווי פתוחה למשתמשים רשומים', then: '/valuation' },
};

export function SiteHeader({ leading, subtitle, fullWidth = true }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // What the sign-in is *for*, which decides what the dialog says and where it goes
  // afterwards. 'account' is somebody signing in for its own sake.
  const [loginIntent, setLoginIntent] = useState<LoginIntent>('account');
  const loginButton = useRef<HTMLButtonElement>(null);
  const publishButton = useRef<HTMLButtonElement>(null);
  const valuationButton = useRef<HTMLButtonElement>(null);

  const { data: savedCount } = useQuery({
    queryKey: qk.saved.count,
    queryFn: fetchSavedCount,
  });

  /*
   * Whether this person has anything of their own on the market, which decides what the
   * button says and where it goes.
   *
   * Only asked for somebody who could have published — signed in, and not in an agency,
   * since an agency publishes from its own dashboard. Five minutes stale rather than the
   * usual thirty seconds: the answer changes when somebody publishes their first flat,
   * and that is a thing they do once.
   */
  const couldSell = Boolean(user) && user?.agency?.membershipStatus !== 'active';
  const { data: myListings } = useQuery({
    queryKey: qk.mySale.list,
    queryFn: fetchMyListings,
    enabled: couldSell,
    staleTime: 5 * 60_000,
  });

  const sells = (myListings?.length ?? 0) > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-8 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      {/*
        The first thing in the tab order, invisible until it has focus.

        Without it, reaching the results on a phone-width page means tabbing through the
        whole bar — the logo, the publish button, saved, searches, the account — on
        every single page, which is exactly the "bypass blocks" the standard is about.
        It is `absolute` rather than in the flow so it cannot push the bar down when it
        appears, and the header is `sticky`, which is positioned, so it has something to
        be absolute against.

        Every page that renders this header also has `<main id="main">`. A skip link
        pointing at an id that is not there is worse than no skip link: it moves focus
        nowhere and says nothing about it.
      */}
      <a
        href="#main"
        className="sr-only rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:start-4 focus:top-2.5 focus:z-50"
      >
        דילוג לתוכן המרכזי
      </a>

      <div
        className={`flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-8 ${
          fullWidth ? '' : 'mx-auto max-w-7xl'
        }`}
      >
        <div className="flex items-center gap-3">
          {/*
            On a phone the links beside the logo do not fit, so they live in a menu.
            The button sits at the right, which is the start in this layout. The
            dashboard already has its own drawer trigger, and does not show these links.
          */}
          {!subtitle && (
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 sm:hidden"
              aria-label="תפריט"
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            </button>
          )}

          {leading}

          {/* Home from anywhere. The one thing on this bar that is always in the same
              place is the way back. */}
          <Link
            to="/"
            aria-label="Urban365, דף הבית"
            className="relative inline-block text-xl font-extrabold tracking-tight text-blue-700 transition hover:text-blue-800"
          >
            {/* The roof from the icon, over the U. The wordmark is text so it stays
                crisp, selectable and in the page's own font; only the roof is drawn.
                `left`, not `inset-inline-start`: the page is RTL but the Latin run is
                laid out left to right, so the U is always at the left. */}
            <svg
              viewBox="0 0 18 8"
              aria-hidden
              className="absolute top-[-2px] left-[-1px] h-2 w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1.5 6.5 9 1.5l7.5 5" />
            </svg>
            Urban<span className="text-blue-500">365</span>
          </Link>

          {subtitle ? (
            <span className="hidden border-s border-slate-200 ps-3 text-sm text-slate-500 sm:inline">
              {subtitle}
            </span>
          ) : (
            /*
              The way in to the city pages, and the only link to them from the app.
              Those pages are rendered by the API rather than by this bundle, so this is
              a plain anchor: a react-router <Link> would try to resolve /nadlan in the
              client's own route table and find nothing.

              Only where there is no subtitle, which is the buyer-facing pages. On the
              agency dashboard the space beside the logo already says which agency you
              are in, and a third item there reads as a breadcrumb that goes nowhere.
            */
            <nav aria-label="ניווט ראשי" className="hidden items-center gap-0.5 border-s border-slate-200 ps-2 sm:flex">
              {/*
                A plain anchor, unlike its neighbour: the city pages are rendered by the
                API and are not in this bundle's route table, so a <Link> would try to
                resolve /nadlan here and find nothing.
              */}
              <Link
                to="/agencies"
                className={navLink}
              >
                סוכנויות
              </Link>
              <NavBar />
              <a
                href="/nadlan"
                className={navLink}
              >
                מחירים לפי עיר
              </a>
              <NavBar />
              {/*
                Plain anchor, like the city pages: /blog is HTML from the API, not a
                route in this bundle.
              */}
              <a href="/blog" className={navLink}>
                בלוג
              </a>
              <NavBar />
              <Link
                to="/mortgage"
                className={navLink}
              >
                מחשבון משכנתא
              </Link>
              <NavBar />
              {/*
                A dialog rather than a link when signed out, for the same reason as
                the publish button below: the page behind it is useless without a
                session, and sending someone to a sign-in page to find that out costs
                them a navigation to learn something we already knew.
              */}
              {user ? (
                <Link
                  to="/valuation"
                  className={navLink}
                >
                  הערכת שווי
                </Link>
              ) : (
                <button
                  ref={valuationButton}
                  type="button"
                  onClick={() => {
                    setLoginIntent('valuation');
                    setLoginOpen(true);
                  }}
                  className={navLink}
                >
                  הערכת שווי
                </button>
              )}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/*
            Not shown to agencies: they publish from their own dashboard, and a listing
            made here would belong to the person rather than to the agency — invisible
            to their colleagues and missing from their CRM.

            Shown signed out, where the guard on /sell asks for a sign-in and returns.
          */}
          {user?.agency?.membershipStatus !== 'active' && (
            <div className="group relative">
              {user ? (
                /*
                  Two states, because one label cannot be honest about both. Somebody
                  who has published a flat wants to see how it is doing, and a button
                  marked "פרסום נכס" is not a reason to press anything — while a button
                  marked "הנכסים שלי" means nothing to somebody who has none. So the
                  label follows what they have, and the destination follows the label:
                  the list for a seller, the form for everybody else.
                */
                <Link
                  to={sells ? '/sell' : '/sell/new'}
                  className={publishClass}
                  aria-label={sells ? 'הנכסים שלי' : 'פרסום נכס'}
                >
                  {sells ? (
                    <Building2 className="h-4 w-4" aria-hidden />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden />
                  )}
                  {/* The words fold away on a phone, like שמורים beside it. This used
                      to be hidden altogether below `sm`, which left a private seller
                      with no way to reach their own listings from a phone at all. */}
                  <span className="hidden sm:inline">
                    {sells ? 'הנכסים שלי' : 'פרסום נכס'}
                  </span>
                </Link>
              ) : (
                // A dialog rather than a link to /login: signing in is a detour, and
                // leaving the page would throw away a search someone has already built.
                // Once there is a session we carry on to where they were going.
                <button
                  ref={publishButton}
                  type="button"
                  onClick={() => {
                    setLoginIntent('sell');
                    setLoginOpen(true);
                  }}
                  className={publishClass}
                  aria-label="פרסום נכס"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">פרסום נכס</span>
                </button>
              )}

              {/*
                Said on hover rather than after the click, so being asked to sign in is
                not a surprise. Only signed out: for someone with an account it is noise
                about a condition they already meet.
              */}
              {!user && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-full right-0 z-20 mt-2 hidden w-56 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100 sm:block"
                >
                  פרסום נכס פתוח למשתמשים רשומים בלבד. נבקש כניסה קצרה ונחזיר אתכם לכאן.
                </span>
              )}
            </div>
          )}

          {/*
            Always there, signed in or not — saving does not require an account, so
            neither does finding what you saved.
          */}
          <Link
            to="/saved"
            aria-label="נכסים שמורים"
            className="relative flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <span className="relative">
              <Heart className="h-5 w-5" aria-hidden />
              {(savedCount ?? 0) > 0 && (
                // On the icon rather than beside the words, so it reads as a count of
                // what is behind the link rather than as part of its label.
                <span
                  dir="ltr"
                  aria-hidden
                  className="absolute -right-2 -top-2 flex min-w-[1.1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[0.65rem] font-bold leading-[1.1rem] text-white ring-2 ring-white"
                >
                  {savedCount! > 99 ? '99+' : savedCount}
                </span>
              )}
            </span>
            <span className="hidden sm:inline">שמורים</span>
          </Link>

          {/*
            Only signed in: a saved search belongs to an account, unlike a saved
            listing, which a signed-out browser keeps on its own. Offering it to
            everybody would be offering a page that can only say "sign in first".

            Marked "חיפושים" and not "התראות". The page behind it is called חיפושים
            שמורים and is where a saved search lives; a bell marked "notifications"
            is where nobody looks for one, which is why somebody who had saved three
            of them could not find any.
          */}
          {user && (
            <Link
              to="/alerts"
              aria-label="חיפושים שמורים"
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
            >
              <Bell className="h-5 w-5" aria-hidden />
              <span className="hidden sm:inline">חיפושים</span>
            </Link>
          )}

          {/*
            Signed in, this has to be the account — not a sign-in link. The login page
            redirects anyone who already has a session, so offering it here sent you to
            /login and straight back, which reads as the link being broken.
          */}
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                to={canUseCrm(user) ? '/app/profile' : '/account'}
                className="flex items-center rounded-full transition hover:opacity-80"
                aria-label={`${user.firstName} ${user.lastName}`.trim() || 'החשבון שלי'}
                title={`${user.firstName} ${user.lastName}`.trim()}
              >
                <Avatar size="sm" src={user.avatarUrl} firstName={user.firstName} lastName={user.lastName} />
              </Link>
              <button
                type="button"
                // Home rather than wherever they were: half the pages behind this bar
                // need a session, and staying on one only to be bounced to a sign-in
                // reads as the sign-out having failed.
                // On a phone this lives in the drawer. The dashboard has no such drawer
                // (it brings its own), so there the word stays in the bar.
                onClick={() => void logout().then(() => navigate('/', { replace: true }))}
                className={`text-sm text-slate-500 transition hover:text-slate-900 ${subtitle ? '' : 'hidden sm:inline'}`}
              >
                יציאה
              </button>
            </div>
          ) : (
            <button
              ref={loginButton}
              type="button"
              onClick={() => {
                setLoginIntent('account');
                setLoginOpen(true);
              }}
              className="text-sm text-blue-700 hover:underline"
            >
              התחברות
            </button>
          )}
        </div>
      </div>

      {!subtitle &&
        createPortal(
          <>
            <button
              type="button"
              aria-hidden={!menuOpen}
              tabIndex={-1}
              className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity sm:hidden ${
                menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              onClick={() => setMenuOpen(false)}
            />
            <nav
              id="site-menu"
              aria-label="תפריט ראשי"
              aria-hidden={!menuOpen}
              className={`fixed inset-y-0 start-0 z-50 flex w-72 max-w-[85vw] flex-col gap-1 bg-white p-4 shadow-xl transition-transform duration-200 ease-out sm:hidden ${
                menuOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'
              }`}
            >
              <button
                type="button"
                className="mb-1 inline-flex h-9 w-9 items-center justify-center self-start rounded-lg text-slate-700 hover:bg-slate-100"
                aria-label="סגירה"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
              <Link to="/agencies" className={navLink} onClick={() => setMenuOpen(false)}>
                סוכנויות
              </Link>
              <a href="/nadlan" className={navLink} onClick={() => setMenuOpen(false)}>
                מחירים לפי עיר
              </a>
              <a href="/blog" className={navLink} onClick={() => setMenuOpen(false)}>
                בלוג
              </a>
              <Link to="/mortgage" className={navLink} onClick={() => setMenuOpen(false)}>
                מחשבון משכנתא
              </Link>
              {user ? (
                <Link to="/valuation" className={navLink} onClick={() => setMenuOpen(false)}>
                  הערכת שווי
                </Link>
              ) : (
                <button
                  type="button"
                  className={`${navLink} text-start`}
                  onClick={() => {
                    setMenuOpen(false);
                    setLoginIntent('valuation');
                    setLoginOpen(true);
                  }}
                >
                  הערכת שווי
                </button>
              )}
              {user && (
                <button
                  type="button"
                  className={`${navLink} mt-auto text-start text-slate-500`}
                  onClick={() => {
                    setMenuOpen(false);
                    void logout().then(() => navigate('/', { replace: true }));
                  }}
                >
                  יציאה
                </button>
              )}
            </nav>
          </>,
          document.body,
        )}

      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        returnFocusTo={
          { account: loginButton, sell: publishButton, valuation: valuationButton }[loginIntent]
        }
        description={ASKED_FOR[loginIntent].because}
        // Google leaves the site, so for it the intent has to travel as a destination.
        returnTo={ASKED_FOR[loginIntent].then}
        onSignedIn={() => {
          const next = ASKED_FOR[loginIntent].then;
          if (next) navigate(next);
        }}
      />
    </header>
  );
}
