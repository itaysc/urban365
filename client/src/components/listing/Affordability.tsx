import { Link } from 'react-router-dom';
import { quoteListing, type BuyingMark, type BuyingPower } from '@/lib/buying-power';
import { formatShekel } from '@/lib/format';
import { BUYER_LABEL } from '@/lib/mortgage';

const MARK_LABEL: Record<BuyingMark, string> = {
  equity: 'חסר הון עצמי',
  income: 'החזר מעל התקרה',
  cash: 'חסר מזומן',
};

/**
 * The household's numbers on one for-sale card.
 *
 * The listing stays either way. The amber chip is the mark for a loan a bank would
 * not write, or for a deposit that covers the bank and not the tax. The tax comes
 * out of the same money, so that card is marked short of equity as well.
 */
export function AffordabilityMark({ price, power }: { price: number; power: BuyingPower }) {
  const quote = quoteListing(power, price);
  const breakdown = `מס רכישה ${formatShekel(quote.purchaseTax)}, עורך דין ${formatShekel(quote.lawyer)} (הערכה). הבנק לא מממן אותם.`;

  return (
    <div className="rounded-lg bg-[var(--paper)] px-2.5 py-2 text-xs leading-snug">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="font-semibold tabular-nums text-slate-900">החזר {formatShekel(quote.monthly)}</span>
        {quote.marks.length > 0 && (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
            {quote.marks.map((mark) => MARK_LABEL[mark]).join(' · ')}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-slate-500" title={breakdown}>
        הון נדרש {formatShekel(quote.equityRequired)} · מס ועורך דין {formatShekel(quote.extraCash)}
      </p>
    </div>
  );
}

/**
 * Why the chips are there. The search is not filtered: every listing is still listed,
 * and this says whose numbers the marks were drawn from.
 */
export function BuyingPowerNote({ power, onClear }: { power: BuyingPower; onClear: () => void }) {
  return (
    <p className="text-sm text-slate-600">
      כל הדירות מוצגות. הסימון לפי {BUYER_LABEL[power.buyer]}, הון {formatShekel(power.equity)}
      {power.incomeKnown && power.income > 0 ? ` והכנסה ${formatShekel(power.income)}` : ''}.{' '}
      <Link to="/mortgage?tab=budget" className="font-medium text-blue-700 hover:underline">
        עדכון
      </Link>
      {' · '}
      <button type="button" onClick={onClear} className="font-medium text-blue-700 hover:underline">
        הסרה
      </button>
    </p>
  );
}
