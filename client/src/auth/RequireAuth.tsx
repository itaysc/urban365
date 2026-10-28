import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';

/** Full-page spinner while the session is still being established. */
function Booting() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">טוען…</div>
  );
}

/**
 * A layout route around everything that needs a session. It stashes where you were
 * going so login can send you back.
 */
export function RequireAuth({ requireAgency = false }: { requireAgency?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Booting />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  // Signed in, but the agency claim has not been approved yet.
  if (requireAgency && user.agency?.membershipStatus !== 'active') {
    return <Navigate to="/app/pending" replace />;
  }

  return <Outlet />;
}

/** Platform staff only — the moderation queue. */
export function RequireAdmin() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Booting />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (user.platformRole !== 'admin') return <Navigate to="/app" replace />;

  return <Outlet />;
}
