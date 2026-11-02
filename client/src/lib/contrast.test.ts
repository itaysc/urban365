import { describe, expect, it } from 'vitest';

/**
 * The colour pairs the site puts text on, checked against WCAG AA.
 *
 * This exists because the accessibility statement used to say contrast "had been
 * checked", which meant somebody had looked at a couple of screens. A claim like that
 * is either a test or a guess, and a guess in a legal document is the wrong kind. Here
 * it is a test: add a pair when a new combination appears, and it fails the suite
 * rather than a user.
 *
 * Only pairs that actually carry text. A border or a divider is a different threshold
 * and a different question.
 */

/** Tailwind 3's default palette, for the shades this app uses on text. */
const PALETTE: Record<string, string> = {
  white: '#ffffff',
  'slate-50': '#f8fafc',
  'slate-100': '#f1f5f9',
  'slate-400': '#94a3b8',
  'slate-500': '#64748b',
  'slate-600': '#475569',
  'slate-700': '#334155',
  'slate-800': '#1e293b',
  'slate-900': '#0f172a',
  'blue-50': '#eff6ff',
  'blue-500': '#3b82f6',
  'blue-600': '#2563eb',
  'blue-700': '#1d4ed8',
  'amber-50': '#fffbeb',
  'amber-100': '#fef3c7',
  'amber-800': '#92400e',
  'amber-900': '#78350f',
  'red-50': '#fef2f2',
  'red-600': '#dc2626',
  'red-700': '#b91c1c',
  'red-800': '#991b1b',
};

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  const [r, g, b] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(PALETTE[foreground] ?? foreground);
  const b = luminance(PALETTE[background] ?? background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * AA asks 4.5:1 of body text and 3:1 of large text — 24px, or 18.66px when bold.
 * `large` marks the pairs that only ever appear at those sizes.
 */
interface Pair {
  fg: string;
  bg: string;
  where: string;
  large?: true;
}

const PAIRS: Pair[] = [
  // Body and headings.
  { fg: 'slate-900', bg: 'white', where: 'כותרות וטקסט ראשי' },
  { fg: 'slate-900', bg: 'slate-50', where: 'כותרות על רקע העמוד' },
  { fg: 'slate-700', bg: 'white', where: 'גוף המסמכים המשפטיים' },
  { fg: 'slate-600', bg: 'white', where: 'טקסט משני בכרטיסים' },
  { fg: 'slate-600', bg: 'slate-50', where: 'טקסט משני על רקע העמוד' },
  { fg: 'slate-600', bg: 'slate-100', where: 'טקסט על שדה מושבת' },
  { fg: 'slate-500', bg: 'white', where: 'טקסט עזר ומשנה' },
  { fg: 'slate-500', bg: 'slate-50', where: 'טקסט עזר על רקע העמוד' },
  /*
   * `slate-400` is deliberately absent, and should stay absent. It was the app's third
   * tier of grey — hints, counts, the struck-through old price — at 2.56:1 on white,
   * which is not a near miss but roughly half of what AA asks. Every occurrence is now
   * `slate-500`, and the site has two tiers of grey rather than three.
   */

  // Links and buttons.
  { fg: 'blue-700', bg: 'white', where: 'קישורים' },
  { fg: 'blue-700', bg: 'slate-50', where: 'קישורים על רקע העמוד' },
  { fg: 'white', bg: 'slate-900', where: 'כפתור ראשי' },
  { fg: 'white', bg: 'blue-600', where: 'כפתור קריאה לפעולה' },
  { fg: 'white', bg: 'red-600', where: 'כפתור מחיקה' },
  { fg: 'blue-700', bg: 'blue-50', where: 'תגית נבחרת' },
  // The "365" of the wordmark, which is 20px extra-bold and so judged as large text.
  // A logotype is exempt from 1.4.3 altogether; it is here because it is set in live
  // text rather than an image, and a pair nobody checks is a pair that drifts.
  { fg: 'blue-500', bg: 'white', where: 'הספרות בלוגו', large: true },

  // Messages.
  { fg: 'red-700', bg: 'white', where: 'שגיאת שדה' },
  { fg: 'red-800', bg: 'red-50', where: 'הודעת שגיאה בטופס' },
  { fg: 'amber-900', bg: 'amber-50', where: 'באנר טיוטה, אזהרת הון עצמי' },
  { fg: 'amber-800', bg: 'amber-100', where: 'תגית בלעדיות' },
];

describe('contrast', () => {
  it('computes the ratio the standard defines', () => {
    // Black on white is 21:1 and white on white is 1:1 — the two ends of the scale,
    // which is the cheapest way to know the formula is the right way up.
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('white', 'white')).toBeCloseTo(1, 5);
  });

  it.each(PAIRS)('$fg on $bg — $where', ({ fg, bg, large }) => {
    const required = large ? 3 : 4.5;
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(required);
  });
});
