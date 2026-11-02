import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Money, Row, Slide } from '@/components/mortgage/fields';
import { formatShekel, grouped } from '@/lib/format';
import { INCOME_CAP } from '@/lib/mortgage';
import {
  advise,
  childNotes,
  DEFAULT_BUFFER_SHARE,
  DEFAULT_COST_GROWTH,
  horizons,
  NO_OUTGOINGS,
  OUTGOING_LABELS,
  type Household,
  type Outgoings,
} from '@/lib/household';

/** The year a row describes, in words. */
function when(inYears: number): string {
  if (inYears === 0) return 'היום';
  if (inYears === 1) return 'בעוד שנה';
  return `בעוד ${inYears} שנים`;
}

const REASON: Record<'now' | 'child' | 'growth', string> = {
  now: 'המצב כיום',
  child: 'עם הילד הנוסף',
  growth: 'אחרי עליית השכר',
};

interface Props {
  /**
   * Income and existing commitments are the page's, not this component's.
   *
   * They appear on the budget tab too, and for a while this asked for them a second
   * time with state of its own — two fields holding one fact, which is two fields
   * that disagree. The fields are rendered here because this tab cannot be filled in
   * without them, but the value behind both copies is the same one.
   */
  netIncome: number;
  onNetIncome: (value: number) => void;
  commitments: number;
  onCommitments: (value: number) => void;
  /** The repayment currently chosen on the calculator, so the rows can test it. */
  repayment: number;
  /** Hands the recommendation back to the field it is advice about. */
  onUse: (monthly: number) => void;
}

/**
 * What the household can carry, as distinct from what the bank will approve.
 *
 * The calculator above answers the bank's question: 40% of income, and a third of
 * the price down. Neither of those asks what the rest of the money is already doing,
 * and a repayment that clears both can still be one nobody can live on. This is the
 * other half — the household's own outgoings, the children they have and the one
 * they are planning, and the rise they are expecting — ending in a number they can
 * put straight into the field above.
 *
 * Every amount here is typed by the household. Nothing is filled in on their behalf
 * from an average family budget or a cost-per-child table: those figures are all
 * wrong for somebody, and this one would be wrong underneath a recommendation to
 * borrow for thirty years.
 */
export function HouseholdPlanner({
  netIncome,
  onNetIncome,
  commitments,
  onCommitments,
  repayment,
  onUse,
}: Props) {
  const [outgoings, setOutgoings] = useState<Outgoings>(NO_OUTGOINGS);
  const [childAges, setChildAges] = useState<number[]>([]);
  const [planning, setPlanning] = useState(false);
  const [plannedChildIn, setPlannedChildIn] = useState(2);
  const [plannedChildCost, setPlannedChildCost] = useState(0);
  const [salaryGrowth, setSalaryGrowth] = useState(0);
  const [costGrowth, setCostGrowth] = useState(DEFAULT_COST_GROWTH);
  const [bufferShare, setBufferShare] = useState(DEFAULT_BUFFER_SHARE);

  const household: Household = {
    netIncome,
    // The loans and cards already declared above are part of what the household
    // spends, so they belong in the same subtraction — counted once, from one field.
    outgoings: { ...outgoings, debts: commitments },
    childAges,
    plannedChildIn: planning ? plannedChildIn : null,
    plannedChildCost: planning ? plannedChildCost : 0,
    salaryGrowth,
    costGrowth,
    bufferShare,
  };

  const advice = advise(household);
  const rows = horizons(household, repayment);
  const notes = childNotes(childAges);

  /*
   * The household's answer, held down to the bank's.
   *
   * A family with small outgoings can bear far more than a bank will lend them, and
   * recommending it is advice nobody can act on — the button would carry a figure
   * straight into a budget that refuses it. The lower of the two is the one worth
   * printing, and when it is the bank's the page says so, because "you can afford
   * more than they will give you" is useful to know and invisible otherwise.
   */
  const ceiling = Math.max(0, netIncome * INCOME_CAP - commitments);
  const recommended = Math.min(advice.recommended, Math.round(ceiling));
  const heldByBank = advice.recommended > Math.round(ceiling);

  const setOut = (key: keyof Outgoings, value: number) =>
    setOutgoings((current) => ({ ...current, [key]: value }));

  return (
    <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900">כמה החזר באמת מתאים לי?</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
        הבנק שואל אם ההחזר נכנס ב־40% מההכנסה. הוא לא שואל מה שאר הכסף כבר עושה. כאן
        ממלאים את ההוצאות האמיתיות של הבית, ומקבלים את הסכום שנשאר — ומה יקרה לו כשהבית
        ישתנה.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {/*
            The ids are prefixed. Both tabs are in the document at once — the other
            is hidden, not unmounted, so its answers survive a glance at this one —
            and two elements with id="income" is a label pointing at whichever the
            browser met first.
          */}
          <Money
            id="household-income"
            label="הכנסה חודשית נטו"
            hint="של כל מי שישלם את המשכנתא. אותו סכום שבלשונית התקציב."
            value={netIncome}
            onChange={onNetIncome}
          />

          <Money
            id="household-commitments"
            label="הלוואות וכרטיסי אשראי — החזר חודשי"
            hint="מה שיורד מהחשבון כל חודש, לא יתרת החוב. נספר כאן ובחישוב של הבנק גם יחד."
            value={commitments}
            onChange={onCommitments}
          />

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">
              הוצאות חודשיות קבועות
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(OUTGOING_LABELS) as (keyof Outgoings)[])
                // Asked for above, as the figure the bank's own rule subtracts.
                .filter((key) => key !== 'debts')
                .map((key) => (
                <Money
                  key={key}
                  id={`out-${key}`}
                  label={OUTGOING_LABELS[key]}
                  value={outgoings[key]}
                  onChange={(value) => setOut(key, value)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">ילדים</legend>

            <ul className="flex flex-wrap gap-2">
              {childAges.map((age, at) => (
                <li
                  key={at}
                  className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white ps-2"
                >
                  <input
                    type="number"
                    min={0}
                    max={30}
                    dir="ltr"
                    aria-label={`גיל הילד ה־${at + 1}`}
                    value={age}
                    onChange={(e) =>
                      setChildAges((c) =>
                        c.map((v, i) => (i === at ? Number(e.target.value) : v)),
                      )
                    }
                    className="w-12 bg-transparent py-1.5 text-center text-sm tabular-nums outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setChildAges((c) => c.filter((_, i) => i !== at))}
                    aria-label={`הסרת הילד ה־${at + 1}`}
                    className="rounded-s-none rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}

              <li>
                <button
                  type="button"
                  onClick={() => setChildAges((c) => [...c, 0])}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-900"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  הוספת ילד
                </button>
              </li>
            </ul>

            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              הגילים משמשים לציון מתי דברים משתנים, לא לכמה הם עולים — את הסכומים רק
              אתם יודעים, והם כבר בהוצאות למעלה.
            </p>

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={planning}
                onChange={(e) => setPlanning(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              מתכננים ילד נוסף
            </label>

            {planning && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Slide
                  id="planned-in"
                  label="בעוד"
                  value={plannedChildIn}
                  onChange={setPlannedChildIn}
                  min={1}
                  max={10}
                  step={1}
                  format={(v) => `${v} שנים`}
                />
                <Money
                  id="planned-cost"
                  label="תוספת להוצאה החודשית"
                  value={plannedChildCost}
                  onChange={setPlannedChildCost}
                />
              </div>
            )}
          </fieldset>

          <Slide
            id="growth"
            label="עליית שכר שנתית צפויה"
            value={salaryGrowth}
            onChange={setSalaryGrowth}
            min={0}
            max={10}
            step={0.5}
            format={(v) => `${v}%`}
          />

          <Slide
            id="cost-growth"
            label="התייקרות שנתית של ההוצאות"
            value={costGrowth}
            onChange={setCostGrowth}
            min={0}
            max={6}
            step={0.1}
            format={(v) => `${v.toFixed(1)}%`}
          />
          <p className="-mt-2 text-xs leading-relaxed text-slate-500">
            פותח על {DEFAULT_COST_GROWTH}% — הממוצע השנתי של מדד המחירים לצרכן בישראל
            בעשור 2016–2025 לפי נתוני הבנק העולמי, עשור שכולל גם שנתיים של ירידת מחירים
            וגם את הזינוק של 2022. אפשר לשנות, ואפס משאיר את ההוצאות קפואות.
          </p>

          <Slide
            id="buffer"
            label="כרית ביטחון שנשארת בצד"
            value={Math.round(bufferShare * 100)}
            onChange={(v) => setBufferShare(v / 100)}
            min={0}
            max={30}
            step={1}
            format={(v) => `${v}% מההכנסה`}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">החזר חודשי מומלץ</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900">
              {formatShekel(recommended)}
            </p>

            <div className="mt-3">
              <Row label="נשאר אחרי ההוצאות" value={formatShekel(advice.disposable)} />
              <Row
                label={`כרית ביטחון (${Math.round(bufferShare * 100)}%)`}
                value={formatShekel(advice.buffer)}
                tone="muted"
              />
            </div>

            {heldByBank && (
              <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-600">
                הבית יכול לשאת {formatShekel(advice.recommended)}, אבל הבנק לא ילווה
                מעבר ל־{formatShekel(Math.round(ceiling))} על ההכנסה הזו — {Math.round(INCOME_CAP * 100)}%
                ממנה, פחות ההחזרים הקיימים. ההמלצה מוגבלת לתקרה.
              </p>
            )}

            {recommended > 0 ? (
              <button
                type="button"
                onClick={() => onUse(recommended)}
                className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                שימוש בסכום הזה בחישוב התקציב
              </button>
            ) : (
              /* Nothing to recommend is a finding, not an empty state. */
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
                ההוצאות הקבועות מכסות את כל ההכנסה, כך שאין ממה להחזיר משכנתא. זה לא
                אומר שאי אפשר לקנות — זה אומר שהמספרים האלה צריכים להשתנות קודם.
              </p>
            )}
          </div>

          {/*
            The same sum at the moments the household itself said it would change.
            Signing on today's payslip is the easy part; the row worth reading is the
            one for the year the family is a person larger.
          */}
          {rows.length > 1 && (
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                מה יישאר אחרי החזר של {formatShekel(repayment)}
              </h3>

              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="pb-1 text-start font-medium">מתי</th>
                    <th className="pb-1 text-start font-medium">הכנסה</th>
                    <th className="pb-1 text-start font-medium">נשאר בחודש</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.reason}-${row.inYears}`} className="border-t border-slate-100">
                      <td className="py-1.5 text-slate-600">
                        {when(row.inYears)}
                        <span className="block text-xs text-slate-500">{REASON[row.reason]}</span>
                      </td>
                      <td className="py-1.5 tabular-nums text-slate-600">
                        {grouped.format(row.income)}
                      </td>
                      <td
                        className={`py-1.5 font-semibold tabular-nums ${
                          row.spare < 0 ? 'text-red-700' : 'text-slate-900'
                        }`}
                      >
                        {grouped.format(row.spare)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {costGrowth > 0
                  ? `ההוצאות מתייקרות ב־${costGrowth.toFixed(1)}% בשנה בשורות האלה, וההחזר נשאר קבוע — כך הוא נשאר במסלול לא צמוד.`
                  : 'ההוצאות מוחזקות קפואות בשורות האלה. בפועל הן יעלו, כך שהשורות האלה אופטימיות.'}
              </p>
            </div>
          )}

          {notes.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-600">
              {notes.map((note) => (
                <li key={note.kind}>
                  {note.kind === 'daycare' &&
                    `${note.count === 1 ? 'ילד אחד' : `${note.count} ילדים`} עדיין לפני כיתה א׳. ההוצאה על מעון וגן יורדת כשהם נכנסים לבית הספר — כמה, רק אתם יודעים.`}
                  {note.kind === 'leaving' &&
                    `בעוד ${note.inYears} שנים הילד הגדול יגיע לגיל 18, ורוב ההוצאה הישירה עליו משתנה — בתוך תקופת המשכנתא.`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-slate-500">
        כל הסכומים כאן הם שלכם — הדף לא ממלא הוצאות ממוצעות ולא מתמחר ילד, כי המספר
        הממוצע שגוי עבור מישהו, וכאן הוא היה עומד מתחת להמלצה להתחייב ל־30 שנה. החישוב
        הוא חיסור, לא תחזית.
      </p>
    </section>
  );
}
