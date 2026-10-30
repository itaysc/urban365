import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, Plus } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { Avatar } from '@/components/ui/Avatar';
import { qk } from '@/queries/keys';
import { fetchSavedCount } from '@/services/saved';

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

          {subtitle && (
            <span className="hidden border-s border-slate-200 ps-3 text-sm text-slate-500 sm:inline">
              {subtitle}
            </span>
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
            <div className="group relative hidden sm:block">
              {user ? (
                <Link to="/sell" className={publishClass}>
                  <Plus className="h-4 w-4" aria-hidden />
                  פרסום נכס
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
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  פרסום נכס
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
                  className="pointer-events-none absolute top-full right-0 z-20 mt-2 w-56 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100"
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
