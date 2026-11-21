import type { Aspect, BuildingState, Condition, Renewal, Subject } from '../../valuation/adjustments.js';

/** Opening of the question the person sees, so a later turn knows it is still waiting. */
export const VALUATION_QUESTION_LEAD = 'כדי לתת הערכת מחיר טובה יותר';

export interface StatedValuation extends Subject {
  gush: number | null;
  chelka: number | null;
  /** Form fields the person has not mentioned. Empty once the sheet is complete. */
  missing: string[];
}

/** The person said to price the flat with whatever is already known. */
export function userSkipped(latest: string): boolean {
  const text = latest.trim();
  if (/^אין לי[.!]?\s*$/.test(text)) return true;
  return /לא יודע|לא יודעת|אין לי מושג|אין לי את (?:הפרט|הפרטים|המידע|השאר|זה)|(?:^|[\s,.])(?:דלג|תדלג|לדלג)|תמשיך בלי|בלי הפרטים|לא זוכר|לא משנה/.test(
    text,
  );
}

/** A price for one flat, rather than a street average or a sales history. */
export function asksForOneFlat(text: string): boolean {
  if (/ממוצע|היסטור/.test(text)) return false;
  return /הערכת שווי|שווי|תעריך|כמה שווה|מחיר הדירה/.test(text);
}

/**
 * What the person has actually said, and which form fields are still missing.
 *
 * A field counts only when their words support it. A number the model filled in
 * on its own never reaches here.
 */
export function readValuation(said: string): StatedValuation {
  const floor = floorOf(said);
  const topFloor = topFloorOf(said);
  const hasLift = owned(said, /מעלית/g);
  const condition = conditionOf(said);
  const hasParking = owned(said, /חני[הי]/g);
  const hasStorage = owned(said, /מחסן/g);
  const hasBalcony = owned(said, /מרפס/g);
  const hasMamad = owned(said, /ממ["״׳']?ד/g);
  const aspect = aspectOf(said);
  const buildingState = buildingOf(said);
  const renewal = renewalOf(said);
  const gush = numberAfter(said, /גוש\s*(\d+)/);
  const chelka = numberAfter(said, /חלקה\s*(\d+)/);

  const missing: string[] = [];
  if (!placeWasSaid(said)) missing.push('עיר');
  if (!/\d+(?:\.\d)?\s*חדר/.test(said)) missing.push('מספר חדרים');
  if (!areaWasSaid(said)) missing.push('שטח רשום במ״ר');
  if (!/רחוב|שדרות|שד(?:\s|$)|דרך |סמט/.test(said)) missing.push('רחוב');
  if (floor === null) missing.push('קומה');
  if (topFloor === null) missing.push('מתוך כמה קומות הבניין');
  if (hasLift === null) missing.push('מעלית (כן או לא)');
  if (condition === null) missing.push('מצב הדירה: משופצת, במצב טוב, במצב סביר, או דורשת שיפוץ');
  if (hasBalcony === null) missing.push('מרפסת (כן או לא)');
  if (hasMamad === null) missing.push('ממ"ד (כן או לא)');
  if (hasParking === null) missing.push('חניה (כן או לא)');
  if (hasStorage === null) missing.push('מחסן (כן או לא)');
  if (buildingState === null) missing.push('מצב הבניין: חדש או מטופח, רגיל, או ישן ומוזנח');
  if (aspect === null) missing.push('נוף: פתוח, רגיל, או חסום');
  if (renewal === null) missing.push('התחדשות עירונית: תמ"א שאושרה, אין תוכנית, או עבודות בעיצומן');
  if (gush === null || chelka === null) missing.push('גוש וחלקה, אם יש');

  return {
    floor,
    topFloor,
    hasLift,
    condition,
    hasParking,
    hasStorage,
    hasBalcony,
    hasMamad,
    aspect,
    buildingState,
    renewal,
    gush,
    chelka,
    missing,
  };
}

/** The message the person sees. The form under it is what they fill. The turn stops on it. */
export function valuationQuestion(_missing: string[]): string {
  return `${VALUATION_QUESTION_LEAD}, מלאו את מה שידוע. אפשר להשאיר ריק מה שאין.`;
}

/**
 * The question to send before the model speaks.
 *
 * Asked once. A reply, even a partial one, is what the person has, and the
 * estimate uses that. A later question about something else is left alone.
 */
export function pendingValuationQuestion(
  userTexts: string[],
  lastAssistant: string | undefined,
  alreadyPriced = false,
): string | null {
  const latest = userTexts.at(-1) ?? '';
  const said = userTexts.join('\n');
  const waiting = lastAssistant?.startsWith(VALUATION_QUESTION_LEAD) ?? false;
  if (waiting || userSkipped(latest) || filledValuationForm(latest)) return null;
  // A detail added after a price updates that price. It does not start the form again.
  if (alreadyPriced && !asksForOneFlat(latest)) return null;
  if (!asksForOneFlat(said)) return null;
  const missing = readValuation(said).missing;
  if (missing.length === 0) return null;
  return valuationQuestion(missing);
}

/**
 * The city, street, rooms and registered area the person named.
 *
 * These are the same four things the valuation page will not calculate without.
 * A number only the model filled in is left out, so the chat prices the flat
 * that was described.
 */
export function valuationInputs(text: string): {
  city: string | null;
  street: string | null;
  rooms: number | null;
  area: number | null;
} {
  return {
    city: cityOf(text),
    street: streetOf(text),
    rooms: roomsOf(text),
    area: areaOf(text),
  };
}

/** A valuation sheet that already carries a detail. The rest can stay unknown. */
export function filledValuationForm(text: string): boolean {
  if (!/אני רוצה הערכת שווי לדירה/.test(text)) return false;
  return placeWasSaid(text) || /\d+(?:\.\d)?\s*חדר/.test(text) || areaWasSaid(text);
}

/** A follow-up that names a form field, rather than a new question. */
export function addsValuationDetail(text: string): boolean {
  return /קומ|מעלית|מחסן|חני|מרפס|ממ.ד|נוף|בניין|שיפוץ|מצב|גוש|חלקה|תמ|חסום|מטופח|שמור/.test(text);
}

/** How a new estimate differs from the one already shown. */
export function describeInfluence(
  before: { low: number | null; high: number | null; parts?: { label: string; factor: number }[] },
  after: { low: number | null; high: number | null; parts: { label: string; factor: number }[] },
): string {
  const previous = new Map((before.parts ?? []).map((part) => [part.label, part.factor]));
  const changed = after.parts.filter((part) => {
    const prior = previous.get(part.label);
    return prior === undefined || Math.abs(prior - part.factor) > 0.0001;
  });
  const dropped = (before.parts ?? []).filter((part) => !after.parts.some((next) => next.label === part.label));
  const sameRange =
    before.low !== null && before.high !== null && before.low === after.low && before.high === after.high;
  if (changed.length === 0 && dropped.length === 0 && sameRange) {
    return 'הפרטים הנוספים לא מזיזים את ההערכה הקודמת.';
  }
  const moves = [
    ...changed.map((part) => `${part.label} ${signedShift(part.factor)}`),
    ...dropped.map((part) => `${part.label} כבר לא בחישוב`),
  ];
  const range =
    before.low !== null && before.high !== null && after.low !== null && after.high !== null
      ? `לעומת ההערכה הקודמת (${shekel(before.low)}–${shekel(before.high)}), הטווח עכשיו ${shekel(after.low)}–${shekel(after.high)}.`
      : '';
  return [range, moves.join(', ')].filter(Boolean).join(' ');
}

/** Last mention wins: "אין חניה" is false, "יש חניה" is true, silence is unknown. */
function owned(text: string, pattern: RegExp): boolean | null {
  let found: boolean | null = null;
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 8), match.index ?? 0);
    found = /אין|בלי|ללא/.test(before) ? false : true;
  }
  return found;
}

function conditionOf(text: string): Condition | null {
  if (/שיפוץ קל|סביר|רענון/.test(text)) return 'fair';
  if (/שיפוץ יסודי|דורשת שיפוץ|לפני שיפוץ/.test(text)) return 'needs-renovation';
  if (/משופצ|שופצ/.test(text)) return 'renovated';
  if (/מצב טוב/.test(text)) return 'good';
  return null;
}

function renewalOf(text: string): Renewal | null {
  if (!/תמ|פינוי|התחדש/.test(text)) return null;
  if (/בעיצומ/.test(text)) return 'in-works';
  if (/עבר/.test(text)) return 'none';
  if (/מאושר|מתקדם/.test(text)) return 'approved';
  if (/אין תוכנית|אין התחדש|בלי תמ/.test(text)) return 'none';
  return null;
}

function aspectOf(text: string): Aspect | null {
  if (/חסו[מם]/.test(text)) return 'blocked';
  if (/נוף פתוח|פתוח ומואר/.test(text)) return 'open';
  if (/נוף רגיל/.test(text)) return 'ordinary';
  return null;
}

function buildingOf(text: string): BuildingState | null {
  if (/מוזנח/.test(text)) return 'neglected';
  if (/בניין[^.]{0,16}מצב טוב|מצב הבניין טוב/.test(text)) return 'well-kept';
  if (/מטופח|בניין חדש|הבניין חדש|שמור|מתוחזק/.test(text)) return 'well-kept';
  if (/מצב הבניין רגיל|הבניין רגיל|בניין רגיל/.test(text)) return 'ordinary';
  return null;
}

function floorOf(text: string): number | null {
  if (/קומת\s*קרקע/.test(text)) return 0;
  const match = text.match(/קומה\s*(\d{1,2})/);
  return match ? Number(match[1]) : null;
}

function topFloorOf(text: string): number | null {
  const of = text.match(/מתוך\s*(\d{1,2})/);
  if (of) return Number(of[1]);
  const storeys = text.match(/(\d{1,2})\s*קומות/);
  return storeys ? Number(storeys[1]) : null;
}

function cityOf(text: string): string | null {
  const named = [...text.matchAll(/בעיר\s+([א-ת״"']{2,}(?:\s+[א-ת״"']{2,})?)/g)].at(-1);
  if (named) return named[1];
  const stops = new Set([
    'דירה',
    'דירת',
    'רחוב',
    'משכנתא',
    'ממוצע',
    'החזר',
    'מודעה',
    'מודעות',
    'חדרים',
    'חדר',
    'תקציב',
    'מחיר',
    'שכונה',
    'שכונת',
    'עיר',
    'בית',
    'בניין',
    'קומה',
    'מצב',
    'עבר',
    'כלל',
    'נוסף',
    'ערך',
    'מידה',
    'תנאי',
    'סביבות',
  ]);
  let found: string | null = null;
  for (const match of text.matchAll(/(?:^|\s)ב([א-ת]{2,}(?:\s+[א-ת]{2,})?)/g)) {
    const [first, second] = match[1].split(/\s+/);
    if (stops.has(first)) continue;
    found = second ? `${first} ${second}` : first;
  }
  return found;
}

/** "רחוב דב הוז 9" keeps the house number; the register match drops it, as the page does. */
function streetOf(text: string): string | null {
  const match = [...text.matchAll(/(?:רחוב|שדרות|שד['׳.]?)\s+([^,\n]+?)(?=\s+ב[א-ת]|,|$)/g)].at(-1);
  const street = match?.[1]?.trim().replace(/[.,]$/, '');
  return street ? street : null;
}

function roomsOf(text: string): number | null {
  const match = [...text.matchAll(/(\d+(?:\.\d)?)\s*חדר/g)].at(-1);
  return match ? Number(match[1]) : null;
}

function areaOf(text: string): number | null {
  const registered = [...text.matchAll(/(\d[\d,]*)\s*מ["״']ר/g)].at(-1);
  if (registered) return Number(registered[1].replace(/,/g, ''));
  const withoutBalcony = text.replace(/מרפסת(?:\s+\S+){0,3}/g, '');
  const metres = [...withoutBalcony.matchAll(/(\d[\d,]*)\s*מטר/g)].at(-1);
  return metres ? Number(metres[1].replace(/,/g, '')) : null;
}

function numberAfter(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

/** A city or neighborhood the person named, not the word "דירה" or "רחוב" after ב. */
export function placeWasSaid(text: string): boolean {
  if (/בעיר\s+[א-ת]/.test(text)) return true;
  if (/בשכונ(?:ה|ת)\s+[א-ת]/.test(text)) return true;
  const stops = new Set([
    'דירה',
    'דירת',
    'רחוב',
    'משכנתא',
    'ממוצע',
    'החזר',
    'מודעה',
    'מודעות',
    'חדרים',
    'חדר',
    'תקציב',
    'מחיר',
    'שכונה',
    'שכונת',
    'עיר',
    'בית',
    'בניין',
    'קומה',
    'מצב',
    'עבר',
    'כלל',
    'נוסף',
    'ערך',
    'מידה',
    'תנאי',
    'סביבות',
  ]);
  for (const match of text.matchAll(/(?:^|\s)ב([א-ת]{2,}(?:\s+[א-ת]{2,})?)/g)) {
    const [first, second] = match[1].split(/\s+/);
    if (first === 'שכונת' || first === 'שכונה' || first === 'עיר') return Boolean(second);
    if (!stops.has(first)) return true;
  }
  return false;
}

function areaWasSaid(text: string): boolean {
  if (/\d[\d,]*\s*מ["״']ר/.test(text)) return true;
  const withoutBalcony = text.replace(/מרפסת(?:\s+\S+){0,3}/g, '');
  return /\d[\d,]*\s*מטר/.test(withoutBalcony);
}

function shekel(value: number): string {
  return `${Math.round(value).toLocaleString('he-IL')} ₪`;
}

function signedShift(factor: number): string {
  const points = Math.abs((factor - 1) * 100).toFixed(1);
  return `${factor >= 1 ? '+' : '−'}${points}%`;
}
