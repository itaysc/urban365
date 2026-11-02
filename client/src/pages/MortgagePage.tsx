import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { formatPrice, formatShekel } from '@/lib/format';
import {
  BUYER_LABEL,
  budget,
  DEFAULT_EQUITY_SHARE,
  DEFAULT_RATE,
  DEFAULT_YEARS,
  INCOME_CAP,
  LTV_CAP,
  MAX_YEARS,
  plan,
  type BuyerKind,
} from '@/lib/mortgage';

/** Which question is being asked. The two are the same sum read from opposite ends. */
type Mode = 'payment' | 'budget';

const TAB: Record<Mode, string> = {
  payment: 'מה יהיה ההחזר החודשי',
  budget: 'כמה דירה אפשר לקנות',
};

/** Everything typed is a round number of shekels, so anything else is not a digit. */
const digits = (text: string): number => Number(text.replace(/\D/g, '')) || 0;

const grouped = new Intl.NumberFormat('he-IL');

function Money({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>

      {/*
        The ₪ is a sibling rather than a suffix inside the field, so it cannot be
        deleted, typed over or sent as part of the value. First in the markup puts it
        at the right of an RTL row, and `text-end` under `dir="ltr"` brings the digits
        up against it — the number and its unit read as one thing.
      */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 transition focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/5">
        <span className="text-sm text-slate-500" aria-hidden>
          ₪
        </span>
        <input
          id={id}
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          className="w-full bg-transparent text-end text-base font-medium tabular-nums text-slate-900 outline-none"
          value={value === 0 ? '' : grouped.format(value)}
          placeholder="0"
          onChange={(e) => onChange(digits(e.target.value))}
        />
      </div>

      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * A slider rather than a box for the two values nobody knows exactly.
 *
 * A rate and a term are chosen by feel — "about five per cent", "twenty-five years" —
 * and a slider both says what the sensible range is and lets the answer move while you
 * watch, which is most of what somebody comes here to do.
 */
function Slide({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums text-slate-900">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
      />
    </div>
  );
}

/** One line of the figures beside the headline. */
function Row({ label, value, tone }: { label: string; value: string; tone?: 'muted' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={`text-sm font-semibold tabular-nums ${
          tone === 'muted' ? 'text-slate-500' : 'text-slate-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function BuyerPicker({ value, onChange }: { value: BuyerKind; onChange: (v: BuyerKind) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-slate-700">סוג הרכישה</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {(Object.keys(BUYER_LABEL) as BuyerKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onChange(kind)}
            aria-pressed={value === kind}
            className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${
              value === kind
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {BUYER_LABEL[kind]}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        קובע כמה הבנק מוכן להלוות: עד {Math.round(LTV_CAP[value] * 100)}% ממחיר הנכס.
      </p>
    </fieldset>
  );
}

/**
 * What one more shekel of deposit is worth to a buyer the LTV rule is holding back.
 *
 * It is 1 / (1 - cap), so it is four for a first home and only two for an investor —
 * which is exactly why it is worked out from the cap rather than written into the
 * sentence that says it.
 */
function leverage(buyer: BuyerKind): string {
  const times = 1 / (1 - LTV_CAP[buyer]);
  // "3.3" where it is not a whole number, "4" where it is: a budget multiplier with a
  // trailing .0 reads as a measurement rather than a rule of thumb.
  return Number.isInteger(times) ? `${times}` : times.toFixed(1);
}

const panelClass = 'rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6';

/**
 * The mortgage calculator.
 *
 * Two questions, one set of sums. "What will I pay each month" is the one people think
 * they are asking; "what can I actually buy" is usually the one they need, and it is
 * the one that sends them back to a search with a price they will be lent.
 *
 * Both answers apply the two rules a bank applies, because a monthly payment that
 * ignores them is a number with nothing behind it: the loan is capped at a share of
 * the price by who the buyer is, and the repayment at a share of their income.
 */
export function MortgagePage() {
  const [params] = useSearchParams();

  // Arrived from a listing, which is the common way in: start on that price with the
  // deposit a first-time buyer needs for it, so the page opens on an answer.
  const fromListing = digits(params.get('price') ?? '');

  const [mode, setMode] = useState<Mode>('payment');
  const [buyer, setBuyer] = useState<BuyerKind>('first');
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [years, setYears] = useState(DEFAULT_YEARS);

  const opening = fromListing || 2_000_000;
  const [price, setPrice] = useState(opening);
  /*
   * The deposit that price needs, to the ten thousand above.
   *
   * Rounded up rather than to the nearest: a tenth of a per cent below what the rule
   * asks for is still below it, and the page would open on its own warning.
   */
  const [equity, setEquity] = useState(
    Math.ceil((opening * DEFAULT_EQUITY_SHARE) / 10_000) * 10_000,
  );

  const [income, setIncome] = useState(25_000);
  const [commitments, setCommitments] = useState(0);

  const result = plan({ price, equity, annualRate: rate, years, buyer });
  const reach = budget({ income, commitments, equity, annualRate: rate, years, buyer });

  const shared = (
    <>
      <BuyerPicker value={buyer} onChange={setBuyer} />

      <Slide
        id="rate"
        label="ריבית שנתית"
        value={rate}
        onChange={setRate}
        min={1}
        max={9}
        step={0.1}
        format={(v) => `${v.toFixed(1)}%`}
      />

      <Slide
        id="years"
        label="תקופת ההלוואה"
        value={years}
        onChange={setYears}
        min={4}
        max={MAX_YEARS}
        step={1}
        format={(v) => `${v} שנים`}
      />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">מחשבון משכנתא</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
          ההחזר החודשי על לוח שפיצר, והבדיקה שהבנק עושה ממילא — כמה הוא מוכן להלוות על
          הנכס, וכמה מההכנסה מותר שההחזר ייקח.
        </p>

        {/* The two questions, as two tabs: the inputs barely overlap, and a single form
            that asks for a price and an income at once asks for one of them in vain. */}
        <div
          role="tablist"
          aria-label="מה לחשב"
          className="mt-6 inline-flex rounded-xl border border-slate-200 bg-white p-1"
        >
          {(Object.keys(TAB) as Mode[]).map((key) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition sm:px-4 ${
                mode === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {TAB[key]}
            </button>
          ))}
        </div>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form className={`${panelClass} flex flex-col gap-5`} onSubmit={(e) => e.preventDefault()}>
            {mode === 'payment' ? (
              <>
                <Money
                  id="price"
                  label="מחיר הנכס"
                  value={price}
                  onChange={(next) => setPrice(next)}
                />
                <Money
                  id="equity"
                  label="הון עצמי"
                  hint={`הסכום שלכם. לרכישה הזו צריך לפחות ${formatShekel(
                    Math.ceil(price * (1 - LTV_CAP[buyer])),
                  )}.`}
                  value={equity}
                  onChange={setEquity}
                />
              </>
            ) : (
              <>
                <Money
                  id="income"
                  label="הכנסה חודשית נטו"
                  hint="של משק הבית — מה שנכנס לחשבון, לא ברוטו."
                  value={income}
                  onChange={setIncome}
                />
                <Money
                  id="commitments"
                  label="החזרים חודשיים קיימים"
                  hint="הלוואות וליסינג שרצים כבר. הבנק מקזז אותם מהיכולת."
                  value={commitments}
                  onChange={setCommitments}
                />
                <Money id="equity-budget" label="הון עצמי" value={equity} onChange={setEquity} />
              </>
            )}

            {shared}
          </form>

          {mode === 'payment' ? (
            <section className={panelClass} aria-live="polite">
              <p className="text-sm text-slate-500">החזר חודשי</p>
              <p className="mt-1 text-4xl font-extrabold tabular-nums text-slate-900">
                {formatShekel(result.monthly)}
              </p>

              <div className="mt-4">
                <Row label="סכום המשכנתא" value={formatShekel(result.loan)} />
                <Row label="מימון מהמחיר" value={`${Math.round(result.ltv * 100)}%`} />
                <Row label="סך הריבית לאורך התקופה" value={formatShekel(result.totalInterest)} tone="muted" />
                <Row label="סך ההחזר" value={formatShekel(result.totalPaid)} tone="muted" />
              </div>

              {/*
                The part a payment calculator normally leaves out, and the part that
                sends people to a bank for a loan nobody will write. Said as the amount
                still missing rather than as a percentage, because that is the number
                they have to go and find.
              */}
              {result.equityShortfall > 0 && (
                <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
                  בשביל {BUYER_LABEL[buyer]} הבנק ילווה עד {Math.round(LTV_CAP[buyer] * 100)}%
                  ממחיר הנכס, כך שחסרים עוד {formatShekel(result.equityShortfall)} הון עצמי
                  לרכישה הזו.
                </p>
              )}
            </section>
          ) : (
            <section className={panelClass} aria-live="polite">
              <p className="text-sm text-slate-500">תקציב הרכישה</p>
              <p className="mt-1 text-4xl font-extrabold tabular-nums text-slate-900">
                {formatPrice(reach.price)}
              </p>

              <div className="mt-4">
                <Row label="משכנתא" value={formatShekel(reach.loan)} />
                <Row label="החזר חודשי" value={formatShekel(reach.monthly)} />
                <Row
                  label={`תקרת החזר (${Math.round(INCOME_CAP * 100)}% מההכנסה)`}
                  value={formatShekel(reach.ceiling)}
                  tone="muted"
                />
              </div>

              {/*
                Which of the two rules produced that number, because they want opposite
                things done about them: somebody stopped by their deposit gains nothing
                from stretching the term, and somebody stopped by their income gains
                nothing from saving another ten thousand.
              */}
              <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
                {reach.limitedBy === 'equity'
                  ? `ההון העצמי הוא מה שמגביל כאן: ההכנסה נושאת החזר גבוה יותר, אבל ל${BUYER_LABEL[buyer]} הבנק מלווה עד ${Math.round(LTV_CAP[buyer] * 100)}% מהמחיר. כל שקל שיתווסף להון העצמי מרחיב את התקציב ב־${leverage(buyer)}.`
                  : 'ההכנסה היא מה שמגביל כאן, לא ההון העצמי. תקופה ארוכה יותר תקטין את ההחזר ותגדיל את התקציב — ותייקר את הריבית הכוללת.'}
              </p>

              {/* The point of the whole page, on a site that sells flats: a budget is
                  only useful pointed at what it buys. */}
              {reach.price > 0 && (
                <Link
                  to={`/search?section=forsale&maxPrice=${reach.price}`}
                  className="mt-4 block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  נכסים עד {formatPrice(reach.price)} ←
                </Link>
              )}
            </section>
          )}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          החישוב הוא לוח שפיצר בריבית קבועה אחת, להמחשה בלבד. משכנתא אמיתית מורכבת מכמה
          מסלולים — פריים, קבועה צמודה ולא צמודה — בריביות שונות ובהצמדה למדד, והריבית
          שתקבלו תלויה בכם, בבנק וביום. המספרים כאן אינם הצעה, התחייבות או ייעוץ.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
