import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, Heart, Plus } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { Avatar } from '@/components/ui/Avatar';
import { qk } from '@/queries/keys';
import { fetchSavedCount } from '@/services/saved';
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
   * Edge to edge instead of capped.
   *
   * App chrome over a sidebar: a bar that stops short of the window leaves the sidebar
   * floating in from it. The buyer's pages are capped to match their content.
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
export function SiteHeader({ leading, subtitle, fullWidth = false }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [loginOpen, setLoginOpen] = useState(false);
  // What the sign-in is *for*, which decides what the dialog says and where it goes
  // afterwards. 'account' is somebody signing in for its own sake.
  const [loginIntent, setLoginIntent] = useState<'account' | 'sell'>('account');
  const loginButton = useRef<HTMLButtonElement>(null);
  const publishButton = useRef<HTMLButtonElement>(null);

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

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div
        className={`flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-8 ${
          fullWidth ? '' : 'mx-auto max-w-7xl'
        }`}
      >
        <div className="flex items-center gap-3">
          {leading}

          {/* Home from anywhere. The one thing on this bar that is always in the same
              place is the way back. */}
          <Link
            to="/"
            className="text-xl font-extrabold tracking-tight text-blue-700 transition hover:text-blue-800"
          >
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
            <a
              href="/nadlan"
              className="hidden border-s border-slate-200 ps-3 text-sm text-slate-600 transition hover:text-slate-900 sm:inline"
            >
              מחירים לפי עיר
            </a>
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
                <Link to={sells ? '/sell' : '/sell/new'} className={publishClass}>
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
                to="/app/profile"
                className="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-slate-100"
                title={`${user.firstName} ${user.lastName}`.trim()}
              >
                <Avatar size="sm" src={user.avatarUrl} firstName={user.firstName} lastName={user.lastName} />
                <span className="hidden text-sm text-slate-700 sm:inline">{user.firstName}</span>
              </Link>
              <button
                type="button"
                // Home rather than wherever they were: half the pages behind this bar
                // need a session, and staying on one only to be bounced to a sign-in
                // reads as the sign-out having failed.
                onClick={() => void logout().then(() => navigate('/', { replace: true }))}
                className="text-sm text-slate-500 transition hover:text-slate-900"
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

      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        returnFocusTo={loginIntent === 'sell' ? publishButton : loginButton}
        description={loginIntent === 'sell' ? 'פרסום נכס פתוח למשתמשים רשומים' : undefined}
        // Google leaves the site, so for it the intent has to travel as a destination.
        returnTo={loginIntent === 'sell' ? '/sell/new' : undefined}
        onSignedIn={loginIntent === 'sell' ? () => navigate('/sell/new') : undefined}
      />
    </header>
  );
}
