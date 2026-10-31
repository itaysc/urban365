import {
  Building2,
  Contact,
  CalendarDays,
  ContactRound,
  Handshake,
  LayoutDashboard,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';

/**
 * The CRM's navigation, in one place rather than inline in the layout — the same shape
 * foozool uses. `group` drives the dividers; `adminOnly` keeps the moderation queue out
 * of an ordinary agency's menu.
 */
export const NAV_ITEMS = [
  { path: '/app', label: 'סקירה', icon: LayoutDashboard, group: 'work', end: true },
  { path: '/app/listings', label: 'הנכסים שלי', icon: Building2, group: 'work' },
  { path: '/app/leads', label: 'פניות', icon: Contact, group: 'work' },
  { path: '/app/customers', label: 'לקוחות', icon: ContactRound, group: 'work' },
  { path: '/app/deals', label: 'עסקאות', icon: Handshake, group: 'work' },
  { path: '/app/calendar', label: 'יומן', icon: CalendarDays, group: 'work' },
  { path: '/app/agency', label: 'עמוד הסוכנות', icon: Store, group: 'setup' },
  { path: '/app/team', label: 'צוות', icon: Users, group: 'setup' },
  { path: '/admin/moderation', label: 'ניהול פלטפורמה', icon: ShieldCheck, group: 'admin', adminOnly: true },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
