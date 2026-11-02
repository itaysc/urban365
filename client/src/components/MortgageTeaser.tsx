import { Link } from 'react-router-dom';
import { formatShekel } from '@/lib/format';
import {
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
export function MortgageTeaser({ price }: { price: number }) {
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
