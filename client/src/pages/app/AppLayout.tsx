import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';

/**
 * Logical properties throughout (`ms-`, `pe-`, `text-start`) rather than left/right, so
 * the shell does not have to be unpicked if an LTR locale is ever added.
 */
const navItems = [
  { to: '/app', label: 'סקירה', end: true },
  { to: '/app/listings', label: 'הנכסים שלי' },
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
    navigate('/search', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <NavLink to="/app" className="text-lg font-bold text-slate-900">
            נדל״ן
          </NavLink>

          <div className="flex items-center gap-3">
            {user?.agency && (
              <span className="hidden text-sm text-slate-500 sm:inline">{user.agency.name}</span>
            )}
            <Button variant="ghost" onClick={() => void onLogout()}>
              יציאה
            </Button>
          </div>
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
