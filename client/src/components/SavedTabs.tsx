import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/saved', label: 'נכסים שמורים' },
  { to: '/alerts', label: 'חיפושים שמורים' },
];

/**
 * The two things a person saves, side by side.
 *
 * They were two pages that did not know about each other: the properties you hearted
 * and the searches you asked to be told about, reachable only from two unrelated items
 * in the header — one a heart marked "שמורים", the other a bell marked "התראות". Saving
 * a search and then looking for it under "saved" found nothing, because "saved" meant
 * only the other kind.
 *
 * As tabs they explain each other: whichever one you reach, the other is named.
 */
export function SavedTabs() {
  const { pathname } = useLocation();

  return (
    <nav className="u365-card is-flat flex gap-1 border border-white/80 p-1" aria-label="מה שמרתי">
      {TABS.map((tab) => {
        const current = pathname === tab.to;

        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={current ? 'page' : undefined}
            className={`flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-medium transition ${
              current
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
