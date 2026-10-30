import {
  Accessibility,
  AirVent,
  BadgeCheck,
  Check,
  DoorOpen,
  Fan,
  Fence,
  Grid2x2,
  MoveVertical,
  Package,
  Shield,
  ShieldCheck,
  ShieldHalf,
  Sofa,
  Sparkles,
  Sun,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

/**
 * The things a listing can have.
 *
 * One list in one place: the agency editor and the private-seller form both write to
 * `Listing.amenities`, and the search facets count the exact strings stored — so two
 * copies of this list drifting apart would quietly split one filter into two.
 */
export const AMENITIES = [
  'מעלית',
  'גישה לנכים',
  'מיזוג',
  'מזגן טורנדו',
  'סורגים',
  'מחסן',
  'דוד שמש',
  'משופצת',
  'ממ"ד',
  'מרפסת',
  'ריהוט',
  'מקלט בניין',
  'מקלט קומתי',
  'מטבח כשר',
  'כניסה מיידית',
];

/**
 * A picture for each thing a property can have.
 *
 * Keyed on the stored label, which is also what the facets count and what the filter
 * compares — there is no id behind an amenity, the Hebrew string *is* the value. A
 * label we do not know still renders, with a tick: the list grows from what yad2 sends,
 * and a new one appearing should look unremarkable rather than broken.
 *
 * The three protected spaces are deliberately all shields. They are the same kind of
 * thing at different distances — your own room, the floor's, the building's — and
 * grouping them by shape says that faster than three unrelated pictures would.
 */
const ICONS: Record<string, LucideIcon> = {
  מעלית: MoveVertical,
  'גישה לנכים': Accessibility,
  מיזוג: AirVent,
  'מזגן טורנדו': Fan,
  סורגים: Grid2x2,
  מחסן: Package,
  'דוד שמש': Sun,
  משופצת: Sparkles,
  'ממ"ד': ShieldCheck,
  מרפסת: Fence,
  ריהוט: Sofa,
  'מקלט בניין': Shield,
  'מקלט קומתי': ShieldHalf,
  'מטבח כשר': UtensilsCrossed,
  'כניסה מיידית': DoorOpen,
  בלעדיות: BadgeCheck,
};

export function amenityIcon(label: string): LucideIcon {
  return ICONS[label.trim()] ?? Check;
}
