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

/** The message the person sees. The turn stops on it. */
export function valuationQuestion(missing: string[]): string {
  return [
    `${VALUATION_QUESTION_LEAD}, הפרטים הבאים יעזרו. אפשר לענות על כולם בהודעה אחת, ואפשר לכתוב "אין לי" על מה שלא ידוע.`,
    missing.map((item) => `• ${item}`).join('\n'),
  ].join('\n');
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
  if (waiting || userSkipped(latest)) return null;
  // A detail added after a price updates that price. It does not start the form again.
  if (alreadyPriced && !asksForOneFlat(latest)) return null;
  if (!asksForOneFlat(said)) return null;
  const missing = readValuation(said).missing;
  if (missing.length === 0) return null;
  return valuationQuestion(missing);
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

function numberAfter(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
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
