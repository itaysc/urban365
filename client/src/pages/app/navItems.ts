import {
  Banknote,
  Building2,
  Contact,
  CalendarDays,
  ContactRound,
  Handshake,
  HandHeart,
  LayoutDashboard,
  Landmark,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Wallet,
} from 'lucide-react';

/**
 * The CRM's navigation, in one place rather than inline in the layout — the same shape
 * foozool uses. `group` drives the dividers; `adminOnly` keeps the moderation queue out
 * of an ordinary agency's menu; `vertical` keeps a real-estate agency's listings board
 * out of a mortgage broker's menu and the other way around. Left out, an item shows to
 * both — the shared core (overview, leads, customers, deals, calendar, team, the
 * agency page) is not a thing either vertical has less use for than the other.
 */
export const NAV_ITEMS = [
  { path: '/app', label: 'סקירה', icon: LayoutDashboard, group: 'work', end: true },
  { path: '/app/radar', label: 'הזדמנויות', icon: Sparkles, group: 'work', vertical: 'real_estate' },
  { path: '/app/listings', label: 'הנכסים שלי', icon: Building2, group: 'work', vertical: 'real_estate' },
  { path: '/app/leads', label: 'פניות', icon: Contact, group: 'work' },
  { path: '/app/customers', label: 'לקוחות', icon: ContactRound, group: 'work' },
  { path: '/app/deals', label: 'עסקאות', icon: Handshake, group: 'work' },
  {
    path: '/app/mortgage-cases',
    label: 'תיקי משכנתא',
    icon: Banknote,
    group: 'work',
    vertical: 'mortgage_broker',
  },
  {
    path: '/app/banker-contacts',
    label: 'אנשי קשר בבנקים',
    icon: Landmark,
    group: 'work',
    vertical: 'mortgage_broker',
  },
  {
    path: '/app/cobrokerage',
    label: 'שיתופי פעולה',
    icon: HandHeart,
    group: 'work',
    vertical: 'real_estate',
  },
  { path: '/app/calendar', label: 'יומן', icon: CalendarDays, group: 'work' },
  {
    path: '/app/billing',
    label: 'פרסומים',
    icon: Wallet,
    group: 'setup',
    billing: true,
    vertical: 'real_estate',
  },
  { path: '/app/agency', label: 'עמוד הסוכנות', icon: Store, group: 'setup' },
  { path: '/app/team', label: 'צוות', icon: Users, group: 'setup' },
  { path: '/admin/moderation', label: 'ניהול פלטפורמה', icon: ShieldCheck, group: 'admin', adminOnly: true },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
