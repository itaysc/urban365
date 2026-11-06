import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { useSiteClosed } from '@/hooks/useSiteClosed';
import { guestMayBrowse, isSignupPath } from '@/lib/closedSite';

function Booting() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">טוען…</div>
  );
}

/**
 * While the site is closed, a guest gets the home page and nothing else, with the
 * login sitting on top of it. Signing in, an invite, and a password reset stay
 * reachable — those are how someone who was asked to come in actually gets in.
 */
export function ClosedSiteGate() {
  const { user, loading } = useAuth();
  const { closed, pending } = useSiteClosed();
  const location = useLocation();

  // A guest must not see the open site for a frame while this answer is still in flight.
  // Someone already signed in does not wait: the flag changes nothing for them.
  if (loading || (!user && pending)) return <Booting />;

  if (closed && isSignupPath(location.pathname)) {
    return <Navigate to={user ? '/app' : '/'} replace />;
  }

  const locked = closed && !user;

  // The home page forwards a query string to the search. While closed that search
  // is not a place a guest can be, so drop it before the page can bounce.
  if (locked && location.pathname === '/' && location.search) {
    return <Navigate to="/" replace />;
  }

  if (locked && !guestMayBrowse(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  const showGate = locked && location.pathname === '/';

  return (
    <>
      <div
        className={showGate ? 'pointer-events-none select-none blur-md' : undefined}
        aria-hidden={showGate || undefined}
      >
        <Outlet />
      </div>
      {showGate && (
        <LoginDialog
          open
          locked
          onOpenChange={() => {}}
          description="האתר בהרצה. הכניסה למשתמשים רשומים בלבד."
        />
      )}
    </>
  );
}
