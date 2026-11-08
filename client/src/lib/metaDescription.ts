import type { SearchFilters } from '@/types/search';
import { searchTitle, singlePlace } from './searchTitle';

/**
 * The snippet under the title in a search result.
 *
 * The app is one HTML file, and that file had no description, so every route looked
 * undescribed. These are the public pages a crawler is invited to. Anything else —
 * a signed-in screen, a search the results page describes itself — returns null, and
 * the tag is taken off rather than left saying the previous page.
 *
 * 140–160 characters is the length a result actually shows.
 */

const DESCRIPTIONS: Record<string, string> = {
  '/': 'דירות למכירה ולהשכרה בישראל לפי עיר. ראו מה נמכר באמת, את הנכסים שמוצעים עכשיו, הערכת שווי ומחשבון משכנתא — מסוכנויות ומבעלי בתים, לפני הפנייה.',
  '/agencies':
    'סוכנויות נדל״ן מורשות בישראל. עיינו במשרדים, בנכסים שהם מפרסמים ובדרכי ההתקשרות, ופנו ישירות לסוכנות שמכירה את העיר והשכונה. מצאו את המשרד המתאים.',
  '/mortgage':
    'מחשבון משכנתא לישראל: כמה הון עצמי צריך, מה ההחזר החודשי, ומה תקרת המימון לדירה ראשונה, למשפרי דיור ולדירה להשקעה. זה אומדן, לא הצעת בנק. בדקו מראש.',
  '/valuation':
    'הערכת שווי דירה מעסקאות שנרשמו בסביבה, לא ממחיר המודעה. מתקבל טווח מחירים לפי בניין, רחוב ושכונה. זו אינדיקציה מעסקאות, ולא שמאות מקרקעין. לפני פרסום.',
  '/terms':
    'תנאי השימוש של Urban365: מה מותר לעשות באתר, מי אחראי לתוכן המודעות ולמחירים, ואיך נשמרת הגישה לחשבון של סוכנות, של מוכר פרטי ושל גולש. קראו לפני ההרשמה.',
  '/policy':
    'מדיניות הפרטיות של Urban365: אילו פרטים נאספים בחיפוש, בפנייה לסוכנות ובחשבון, למה הם משמשים, כמה זמן הם נשמרים, ולמי הם לא נמסרים. קראו לפני שנרשמים.',
  '/accessibility':
    'הצהרת הנגישות של Urban365: איך האתר מותאם לקוראי מסך, לניווט במקלדת ולהגדלת טקסט, ואל מי פונים אם עמוד, טופס או תמונה אינם נגישים. נשמח לתקן כל פער.',
};

/** What a search with no city yet should say. A chosen place is named by the results page. */
export const SEARCH_DESCRIPTION =
  'נדל״ן למכירה בישראל. השוו מחירים מעסקאות שנרשמו, ראו מה מוצע עכשיו לפי עיר, וחשבו הערכת שווי ומשכנתא לפני הפנייה לסוכנות או לבעל הדירה. התחילו בעיר.';

/** The results page: the general sentence, or one that names the single place being searched. */
export function searchDescription(
  filters: Pick<SearchFilters, 'section' | 'city' | 'neighborhood' | 'district' | 'q'>,
): string {
  const places = filters.city.length + filters.neighborhood.length + filters.district.length;
  if (!singlePlace(filters) && !filters.q?.trim() && places === 0) return SEARCH_DESCRIPTION;
  return `${searchTitle(filters)}. מודעות עדכניות, מחירים מעסקאות שנרשמו, הערכת שווי ומחשבון משכנתא לפני הפנייה לסוכנות.`;
}

export function descriptionForPath(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/search' || path.startsWith('/agencies/')) return null;
  return DESCRIPTIONS[path] ?? null;
}

/** Every description the table itself writes, for the length a result shows. */
export function describedPages(): [string, string][] {
  return Object.entries(DESCRIPTIONS);
}
