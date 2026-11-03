/**
 * The state a flat is in, as four choices rather than free text.
 *
 * Condition is free text everywhere else in this codebase — `Listing.propertyCondition`
 * holds whatever an agent typed. That is fine for a description and useless for an
 * adjustment: the valuation needs to know how this flat compares to the sort of flat
 * its comparables are, and "משופצת חלקית ב-2015" is not a comparison.
 *
 * Four steps, because the honest resolution is four. `good` is the reference and costs
 * nothing — it means ordinary for the age of the building, which most flats are.
 */

export const CONDITIONS = ['renovated', 'good', 'fair', 'needs-renovation'] as const;

export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABEL: Record<Condition, string> = {
  renovated: 'משופצת',
  good: 'במצב טוב',
  fair: 'במצב סביר',
  'needs-renovation': 'דורשת שיפוץ',
};

/**
 * What each one means, said plainly enough that two people would pick the same one.
 *
 * The guide's warning lives in the first of these, because it is the mistake sellers
 * make most: *"שיפוץ שעשיתם לפני עשר שנים כבר לא נחשב שיפוץ עדכני בעיני קונה."*
 */
export const CONDITION_HINT: Record<Condition, string> = {
  renovated: 'שופצה בשנים האחרונות — מטבח, חדרי רחצה וריצוף',
  good: 'מתוחזקת היטב, אפשר להיכנס בלי עבודות',
  fair: 'דורשת רענון — צבע, מטבח ישן, אבל תפקודית',
  'needs-renovation': 'דורשת שיפוץ יסודי לפני כניסה',
};

export const ASPECTS = ['open', 'ordinary', 'blocked'] as const;
export type Aspect = (typeof ASPECTS)[number];

export const ASPECT_LABEL: Record<Aspect, string> = {
  open: 'נוף פתוח ומוארת',
  ordinary: 'רגיל',
  blocked: 'חסומה, מול קיר או כביש רועש',
};

export const BUILDING_STATES = ['well-kept', 'ordinary', 'neglected'] as const;
export type BuildingState = (typeof BUILDING_STATES)[number];

export const BUILDING_STATE_LABEL: Record<BuildingState, string> = {
  'well-kept': 'חדש או מטופח',
  ordinary: 'רגיל',
  neglected: 'ישן ומוזנח',
};

export const RENEWALS = ['approved', 'none', 'in-works'] as const;
export type Renewal = (typeof RENEWALS)[number];

export const RENEWAL_LABEL: Record<Renewal, string> = {
  approved: 'תמ"א או פינוי-בינוי בשלב מתקדם',
  none: 'אין תוכנית',
  'in-works': 'עבודות בעיצומן',
};
