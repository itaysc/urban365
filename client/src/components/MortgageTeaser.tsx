import { Link } from 'react-router-dom';
import { quoteListing, type BuyingPower } from '@/lib/buying-power';
import { useBuyingPower } from '@/lib/use-buying-power';
import { formatShekel } from '@/lib/format';
import {
  BUYER_LABEL,
  DEFAULT_EQUITY_SHARE,
  DEFAULT_RATE,
  DEFAULT_YEARS,
  LTV_CAP,
  plan,
} from '@/lib/mortgage';

/**
 * What this flat costs a month, on the listing itself.
 *
 * The price is the headline of every listing and it is the wrong unit: nobody pays
 * 2,300,000, they pay something every month for twenty-five years, and the gap between
 * two flats is far easier to feel in the second number than the first. So it is
 * answered here, where the question is actually asked, rather than behind a link to a
 * calculator the reader has to go and find.
 *
 * One shape, stated out loud and deliberately the common one — a first home at the
 * maximum financing, over twenty-five years. Anything else belongs on the calculator,
 * which this hands the price to so nobody retypes it.
 */
function rateLabel(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(1);
}

/**
 * The same block, once this browser has a household.
 *
 * The generic teaser assumes a first home at the maximum financing. That assumption
 * is wrong the moment they have typed their own, and the listing they opened is
 * exactly where the difference matters.
 */
function PersonalTeaser({ price, power }: { price: number; power: BuyingPower }) {
  const quote = quoteListing(power, price);
  const assumption = power.shaped
    ? `לפי התמהיל שבמחשבון, עם הון עצמי של ${formatShekel(power.equity)}. ${BUYER_LABEL[power.buyer]}.`
    : `הון עצמי של ${formatShekel(power.equity)}, ריבית ${rateLabel(power.annualRate)}% ל־${power.years} שנים. ${BUYER_LABEL[power.buyer]}.`;

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-semibold text-slate-900">החזר חודשי משוער</h3>
        <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatShekel(quote.monthly)}</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{assumption} להמחשה בלבד.</p>

      <dl className="mt-3 flex flex-col gap-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">הון שהבנק דורש</dt>
          <dd className="font-medium tabular-nums text-slate-900">{formatShekel(quote.equityRequired)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">מס רכישה</dt>
          <dd className="tabular-nums text-slate-900">{formatShekel(quote.purchaseTax)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">עורך דין, הערכה</dt>
          <dd className="tabular-nums text-slate-900">{formatShekel(quote.lawyer)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        הבנק לא מממן את המס ואת עורך הדין. הם יושבים מעל ההון העצמי.
      </p>

      {power.buyer === 'upgrader' && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          מס הרכישה מחושב כדירה יחידה. למשפרי דיור זה נכון רק אם הדירה הקודמת נמכרת בתוך
          הזמן שהחוק קובע.
        </p>
      )}

      {quote.marks.includes('equity') && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          חסרים {formatShekel(quote.equityShortfall)} הון עצמי כדי שהבנק יממן את הרכישה הזו.
        </p>
      )}
      {quote.marks.includes('income') && quote.ceiling !== null && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          ההחזר גבוה מהתקרה שהבנק יאשר על ההכנסה הזו ({formatShekel(quote.ceiling)}).
        </p>
      )}
      {quote.marks.includes('cash') && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          ההון מכסה את מה שהבנק דורש, ולא את המס ואת עורך הדין. חסרים עוד{' '}
          {formatShekel(quote.extraCash - quote.cashLeft)}.
        </p>
      )}

      <Link
        to={`/mortgage?price=${price}`}
        className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline"
      >
        עדכון החישוב ←
      </Link>
    </section>
  );
}

export function MortgageTeaser({ price }: { price: number }) {
  const power = useBuyingPower();
  if (power) return <PersonalTeaser price={price} power={power} />;

  const equity = Math.round(price * DEFAULT_EQUITY_SHARE);
  const { monthly } = plan({
    price,
    equity,
    annualRate: DEFAULT_RATE,
    years: DEFAULT_YEARS,
    buyer: 'first',
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-semibold text-slate-900">החזר חודשי משוער</h3>
        <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatShekel(monthly)}</p>
      </div>

      {/* The assumptions, in the same breath as the number. A monthly payment with the
          terms left out is not an estimate, it is a claim. */}
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        בהנחת הון עצמי של {formatShekel(equity)} ({Math.round((1 - LTV_CAP.first) * 100)}%
        מהמחיר), ריבית {DEFAULT_RATE}% ל־{DEFAULT_YEARS} שנים. להמחשה בלבד.
      </p>

      <Link
        to={`/mortgage?price=${price}`}
        className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline"
      >
        חישוב עם הנתונים שלי ←
      </Link>
    </section>
  );
}
