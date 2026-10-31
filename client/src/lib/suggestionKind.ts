import type { SuggestionKind } from '@/services/suggestions';

/**
 * The radar's sections, in the order an agent should work through them.
 *
 * Not by score: a viewing tomorrow that nobody has confirmed outranks a very strong
 * match, because one has a deadline this week and the other will still be true on
 * Friday. Sorting the whole page by score alone would mix them and lose that.
 */
export const KIND_ORDER: SuggestionKind[] = [
  'viewing_unanswered',
  'new_match',
  'stale_lead',
  'listing_no_interest',
];

export const KIND_LABEL: Record<SuggestionKind, string> = {
  viewing_unanswered: 'ביקורים שלא אושרו',
  new_match: 'התאמות ללקוחות',
  stale_lead: 'פניות שממתינות',
  listing_no_interest: 'נכסים שאף אחד לא שואל עליהם',
};

/** One line under the heading, saying what the agent is looking at and why. */
export const KIND_HINT: Record<SuggestionKind, string> = {
  viewing_unanswered: 'מתקיימים בימים הקרובים וצד אחד עדיין לא אישר.',
  new_match: 'נכס שנכנס תואם למה שלקוח ביקש.',
  stale_lead: 'מישהו פנה ולא חזרו אליו.',
  listing_no_interest: 'נצפים הרבה ואף אחד לא יוצר קשר — בדרך כלל מחיר או תמונות.',
};
