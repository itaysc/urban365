import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { useSiteClosed } from '@/hooks/useSiteClosed';
import { canUseCrm } from '@/lib/access';
import { guestMayBrowse, isSignupPath } from '@/lib/closedSite';

function Booting() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">טוען…</div>
  );
}

/**
 * While the site is closed, a guest can read the pages a crawler is invited to index
 * and nothing else.
 *
 * The home page is one of those, so it stays readable: blurring it would hide the
 * only indexable page this app renders. City and listing pages never reach here —
 * the API serves them as HTML. Search, the CRM and publishing still send a guest
 * back home. Signing in, an invite and a password reset stay reachable, because
 * those are how someone who was asked to come in actually gets in.
 */
export function ClosedSiteGate() {
  const { user, loading } = useAuth();
  const { closed, pending } = useSiteClosed();
  const location = useLocation();

  // A guest must not see the open site for a frame while this answer is still in flight.
  // Someone already signed in does not wait: the flag changes nothing for them.
  if (loading || (!user && pending)) return <Booting />;

  // Self-serve signup stays shut. An agency that was invited still has to name the
  // office, and sending them to the CRM from here only bounces them back.
  const finishingAgencyInvite =
    user?.accountType === 'agency' && location.pathname.startsWith('/agency/claim');
  if (closed && isSignupPath(location.pathname) && !finishingAgencyInvite) {
    return <Navigate to={user ? (canUseCrm(user) ? '/app' : '/account') : '/'} replace />;
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

  return <Outlet />;
}
