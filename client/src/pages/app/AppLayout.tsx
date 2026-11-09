import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { SiteHeader } from '@/components/SiteHeader';
import { SidebarNav } from './Sidebar';

const STORAGE_KEY = 'nadlan:sidebar-collapsed';

/**
 * Remembered per browser. Wrapped because storage throws in a private window and reads
 * back empty after site data is cleared — neither of which should stop the app
 * rendering, so both fall through to the default.
 */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Pages that are laid out across the window rather than read down a column. */
const WIDE = new Set(['/app/deals', '/app/mortgage-cases']);

export function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isAdmin = user?.platformRole === 'admin';
  const vertical = user?.agency?.vertical;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // A preference that cannot be saved is not worth failing over.
    }
  }, [collapsed]);

  // Browser Back while the drawer is open should close it rather than leave it hanging
  // over the page it navigated to.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/*
        The same bar the rest of the site has, with the two things that only make sense
        here passed through it: the drawer trigger, which belongs beside the menu it
        opens, and whose agency this is.
      */}
      <SiteHeader
        fullWidth
        subtitle={user?.agency?.name}
        leading={
          // Phone only — above sm the sidebar is always there.
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="פתיחת התפריט"
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 sm:hidden"
          >
            <Menu size={22} aria-hidden />
          </button>
        }
      />

      {!user?.emailVerified && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          האימייל שלך עדיין לא אומת. בדוק את תיבת הדואר שלך.
        </div>
      )}

      <div className="flex min-h-[calc(100vh-57px)] items-stretch">
        {/*
          A white panel against the slate page, with a rule on its `end` edge — the left
          under dir="rtl", which is the side facing the content. Same separation foozool
          uses, and it is what stops the menu reading as part of the page.

          Flush rather than inset: the padding lives on `main`, so the panel runs to the
          window edge and the full height of the viewport.
        */}
        <aside
          className={`hidden shrink-0 border-e border-slate-200 bg-white transition-[width] duration-200 sm:block ${
            collapsed ? 'w-16' : 'w-56'
          }`}
        >
          {/* Sticky under the header, so the menu stays reachable down a long list. */}
          <div className="sticky top-[57px] p-3">
            <SidebarNav
              collapsed={collapsed}
              onToggle={() => setCollapsed((c) => !c)}
              isAdmin={isAdmin}
              vertical={vertical}
            />
          </div>
        </aside>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-4 sm:p-6">
          {/* The shell is full width so the sidebar sits against the window edge, but
              the content itself is capped — a form stretched across 1800px is unusable.
              The cap lives here rather than on the shell, which is what used to leave a
              few hundred pixels of nothing beside the menu.

              The deals board is the exception: five columns side by side want every
              pixel there is, and capped at 1024px each one is narrower than the card it
              holds. */}
          <div className={`mx-auto w-full ${WIDE.has(location.pathname) ? '' : 'max-w-5xl'}`}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── mobile drawer ──────────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />

          {/* `start-0`, which under dir="rtl" is the RIGHT edge — the same side as the
              desktop sidebar and as the trigger. `end-0` put it on the left, so the same
              navigation arrived from opposite sides depending on screen width. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="תפריט"
            className="absolute inset-y-0 start-0 flex w-64 flex-col gap-3 bg-white p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">תפריט</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="סגירת התפריט"
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100"
              >
                <X size={20} aria-hidden />
              </button>
            </div>

            <SidebarNav
              collapsed={false}
              onToggle={() => undefined}
              isAdmin={isAdmin}
              vertical={vertical}
              onNavigate={() => setDrawerOpen(false)}
              showToggle={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
