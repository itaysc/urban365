import { placeWasSaid, userSkipped } from './valuation-from-text.js';

/**
 * What a tool still has to ask before it can run.
 *
 * The quick actions send a bare request ("אני רוצה לבדוק את ההחזר"). The fields
 * here are the ones that request does not already contain. A reply, including
 * "אין לי", is enough — the question is not asked again.
 */
export interface ToolIntake {
  tool: string;
  group: string;
  lead: string;
  match: (text: string) => boolean;
  params: { label: string; said: (text: string) => boolean }[];
}

const roomsSaid = (text: string) => /\d+(?:\.\d)?\s*חדר/.test(text);
const moneySaid = (text: string) => /מיליון|מליון|אלף|₪|עד\s*[\d,.]|תקציב|[\d,.]{6,}/.test(text);
const equitySaid = (text: string) => /הון/.test(text) && moneySaid(text);
const buyerSaid = (text: string) => /דירה ראשונה|משפר|משקיע|להשקעה/.test(text);
const streetSaid = (text: string) => /(?:רחוב|שדרות|שד)\s+[א-ת״"']{2,}/.test(text);

export const TOOL_INTAKES: ToolIntake[] = [
  {
    tool: 'street_price_history',
    group: 'pricing',
    lead: 'כדי להראות את מחירי הרחוב',
    match: (text) => /ממוצע|היסטור/.test(text) && /רחוב|שדרות|שד/.test(text),
    params: [
      { label: 'עיר', said: placeWasSaid },
      { label: 'שם הרחוב', said: streetSaid },
    ],
  },
  {
    tool: 'create_saved_search',
    group: 'account',
    lead: 'כדי להגדיר התראה',
    match: (text) => /התראה|תתריע|מתפרסמת/.test(text),
    params: [
      { label: 'עיר או שכונה', said: placeWasSaid },
      { label: 'מספר חדרים', said: roomsSaid },
      { label: 'תקציב', said: moneySaid },
    ],
  },
  {
    tool: 'mortgage_plan',
    group: 'mortgage',
    lead: 'כדי לחשב את ההחזר החודשי',
    match: (text) => /החזר|במשכנתא/.test(text),
    params: [
      { label: 'מחיר הדירה', said: moneySaid },
      { label: 'הון עצמי', said: equitySaid },
      { label: 'סוג הרוכש: דירה ראשונה, משפרי דיור, או דירה להשקעה', said: buyerSaid },
    ],
  },
  {
    tool: 'search_listings',
    group: 'search',
    lead: 'כדי לחפש דירות',
    match: (text) => /מחפש דירה|חיפוש דירות|דירות למכירה|דירות להשכרה/.test(text),
    params: [
      { label: 'עיר או שכונה', said: placeWasSaid },
      { label: 'מספר חדרים', said: roomsSaid },
      { label: 'תקציב', said: moneySaid },
    ],
  },
];

export function matchIntake(text: string): ToolIntake | null {
  return TOOL_INTAKES.find((intake) => intake.match(text)) ?? null;
}

/** The question to send before the model speaks, or null when the tool can run. */
export function pendingToolIntake(userTexts: string[], lastAssistant: string | undefined): string | null {
  const latest = userTexts.at(-1) ?? '';
  const said = userTexts.join('\n');
  const intake = matchIntake(said);
  if (!intake) return null;
  if (lastAssistant?.startsWith(intake.lead) || userSkipped(latest)) return null;
  const missing = intake.params.filter((param) => !param.said(said));
  if (missing.length === 0) return null;
  return [
    `${intake.lead}, הפרטים הבאים יעזרו. אפשר לענות על כולם בהודעה אחת, ואפשר לכתוב "אין לי" על מה שלא ידוע.`,
    missing.map((param) => `• ${param.label}`).join('\n'),
  ].join('\n');
}

/** Told to the model once, after the person answered an intake question. */
export function intakeFollowUp(lastAssistant: string | undefined): string | null {
  const intake = TOOL_INTAKES.find((item) => lastAssistant?.startsWith(item.lead));
  if (!intake) return null;
  return `המשתמש ענה על הפרטים ל-${intake.tool}. קרא לכלי הזה רק עם מה שנאמר. אל תשאל שוב ואל תמציא מספר או עיר.`;
}
