import { NavLink } from 'react-router-dom';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useListingCredits } from '@/hooks/useListingCredits';
import type { AgencyVertical } from '@/types/auth';
import { NAV_ITEMS, type NavItem } from './navItems';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  /** Missing while there is no agency yet (e.g. the pending page); reads as real-estate,
   *  which is also what an item with no `vertical` of its own shows to either way. */
  vertical?: AgencyVertical;
  /** Called after navigating, so the mobile drawer closes itself. */
  onNavigate?: () => void;
  /** The drawer renders the same items without the collapse control. */
  showToggle?: boolean;
}

/**
 * The selected item reads as a selection rather than a pressed button: a tinted row, a
 * stronger weight, and an accent bar on the `start` edge — which under dir="rtl" is the
 * right, the side the menu itself is on.
 *
 * `border-s-4` is on every item, transparent when inactive, so selecting one does not
 * shift the row by four pixels.
 */
const itemClass = (isActive: boolean, collapsed: boolean) =>
  [
    'flex items-center gap-3 rounded-lg py-2 text-sm transition border-s-4',
    collapsed ? 'justify-center px-2' : 'px-3',
    isActive
      ? 'border-blue-600 bg-blue-50 font-semibold text-blue-800'
      : 'border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ');

export function SidebarNav({
  collapsed,
  onToggle,
  isAdmin,
  vertical = 'real_estate',
  onNavigate,
  showToggle = true,
}: Props) {
  const { data: credits } = useListingCredits();
  const items = NAV_ITEMS.filter((item) => {
    if ('adminOnly' in item && item.adminOnly && !isAdmin) return false;
    if ('billing' in item && item.billing && !credits?.enabled) return false;
    if ('vertical' in item && item.vertical !== vertical) return false;
    return true;
  });

  return (
    <div className="flex h-full flex-col gap-1">
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item: NavItem, index) => {
          const Icon = item.icon;
          const previous = items[index - 1];
          // A rule between groups, not before the first item.
          const startsGroup = index > 0 && previous.group !== item.group;

          return (
            <div key={item.path}>
              {startsGroup && <hr className="my-2 border-slate-200" aria-hidden />}

              <NavLink
                to={item.path}
                end={'end' in item ? item.end : undefined}
                onClick={onNavigate}
                // The label is gone when collapsed, so it has to survive as the
                // accessible name and as a hover hint.
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={({ isActive }) => itemClass(isActive, collapsed)}
              >
                <Icon size={20} className="shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            </div>
          );
        })}
      </nav>

      {showToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'הרחבת התפריט' : 'כיווץ התפריט'}
          aria-expanded={!collapsed}
          className={`mt-2 flex items-center gap-3 rounded-lg py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 ${
            collapsed ? 'justify-center px-2' : 'px-3'
          }`}
        >
          {/* Right-facing, because in RTL the panel lives on the right. */}
          {collapsed ? (
            <PanelRightOpen size={20} className="shrink-0" aria-hidden />
          ) : (
            <PanelRightClose size={20} className="shrink-0" aria-hidden />
          )}
          {!collapsed && <span>כיווץ התפריט</span>}
        </button>
      )}
    </div>
  );
}
