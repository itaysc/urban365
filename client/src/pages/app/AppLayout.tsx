import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

/**
 * Logical properties throughout (`ms-`, `pe-`, `text-start`) rather than left/right, so
 * the shell does not have to be unpicked if an LTR locale is ever added.
 */
const navItems = [
  { to: '/app', label: 'סקירה', end: true },
  { to: '/app/listings', label: 'הנכסים שלי' },
  { to: '/app/leads', label: 'פניות' },
  { to: '/app/deals', label: 'עסקאות' },
  { to: '/app/agency', label: 'עמוד הסוכנות' },
  { to: '/app/team', label: 'צוות' },
];

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'block rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
  ].join(' ');
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          {/*
            The page is dir="rtl", so the first child renders on the RIGHT. The avatar
            leads, which is what puts it at the right edge of the nav; the wordmark
            follows on the left.
          */}
          <div className="flex items-center gap-3">
            {/* The avatar alone. `title` and the Avatar's own label carry the name, so
                nothing is lost for a screen reader by dropping the visible text. */}
            <NavLink
              to="/app/profile"
              className="rounded-full transition hover:opacity-80"
              title="הפרופיל שלי"
              aria-label="הפרופיל שלי"
            >
              <Avatar size="md" src={user?.avatarUrl} firstName={user?.firstName} lastName={user?.lastName} />
            </NavLink>

            {user?.agency && (
              <span className="hidden text-sm text-slate-500 sm:inline">{user.agency.name}</span>
            )}

            <Button variant="ghost" onClick={() => void onLogout()}>
              יציאה
            </Button>
          </div>

          <NavLink to="/" className="text-lg font-bold text-slate-900">
            נדל״ן
          </NavLink>
        </div>
      </header>

      {!user?.emailVerified && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          האימייל שלך עדיין לא אומת. בדוק את תיבת הדואר שלך.
        </div>
      )}

      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:flex-row sm:p-8">
        <nav className="flex gap-2 sm:w-48 sm:flex-col">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              {item.label}
            </NavLink>
          ))}
          {user?.platformRole === 'admin' && (
            <NavLink to="/admin/moderation" className={navClass}>
              ניהול פלטפורמה
            </NavLink>
          )}
        </nav>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
