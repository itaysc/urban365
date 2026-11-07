import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useListingCredits } from '@/hooks/useListingCredits';
import { formatShekel } from '@/lib/format';
import { errorMessageOf } from '@/lib/apiError';
import { safeReturnTo } from '@/lib/returnTo';
import { buyListingPackage, type ListingPackage } from '@/services/agency';

const labelFor = (pack: ListingPackage) => (pack.size === 1 ? 'פרסום בודד' : `${pack.size} פרסומים`);

/** Where to go once the credits are in the account. Never back into checkout itself. */
function destination(value: string | null): string {
  const path = safeReturnTo(value, '/app/billing');
  return path.startsWith('/app/billing/checkout') ? '/app/billing' : path;
}

/**
 * The agency picks a pack and confirms the price.
 *
 * The button grants the credits straight away. A card provider plugs in here later;
 * until then this page is the whole checkout.
 */
export function ListingCheckoutPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { data, isPending, isError } = useListingCredits();
  const [size, setSize] = useState<number | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isPending) return <p className="text-sm text-slate-500">טוען…</p>;
  if (isError) return <p className="text-sm text-red-700">לא הצלחנו לטעון את החבילות.</p>;
  if (!data?.enabled) return <p className="text-sm text-slate-600">הפרסום כרגע ללא תשלום.</p>;

  const chosen = data.packages.find((pack) => pack.size === size) ?? null;
  const back = destination(params.get('returnTo'));
  // A new listing with no credits sends them straight back here, so cancel leaves that loop.
  const cancelTo = data.balance < 1 && back === '/app/listings/new' ? '/app/listings' : back;

  const buy = async () => {
    if (!chosen) return;
    setBuying(true);
    setError(null);
    try {
      await buyListingPackage(chosen.size);
      await queryClient.invalidateQueries({ queryKey: qk.listings.packages });
      toast.success(
        chosen.size === 1 ? 'פרסום אחד נוסף לחשבון.' : `${chosen.size} פרסומים נוספו לחשבון.`,
      );
      navigate(back);
    } catch (e) {
      setError(errorMessageOf(e, 'הרכישה נכשלה.'));
      setBuying(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">רכישת פרסומים</h1>
        <p className="mt-1 text-sm text-slate-500">
          {data.balance === 0
            ? 'אין פרסומים בחשבון. בחרו חבילה כדי לפרסם נכס.'
            : `נותרו ${data.balance.toLocaleString('he-IL')} פרסומים.`}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {data.packages.map((pack) => {
          const selected = size === pack.size;
          return (
            <li key={pack.size}>
              <button
                type="button"
                onClick={() => setSize(pack.size)}
                aria-pressed={selected}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-right transition ${
                  selected
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-900 hover:border-slate-900'
                }`}
              >
                <span className="text-sm font-medium">{labelFor(pack)}</span>
                <span className={`text-sm ${selected ? 'text-slate-200' : 'text-slate-500'}`}>
                  {formatShekel(pack.unitAgorot / 100)} לנכס
                  {pack.size > 1 && ` · ${formatShekel(pack.totalAgorot / 100)}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {chosen && (
        <p className="text-sm text-slate-700">
          {labelFor(chosen)} · {formatShekel(chosen.totalAgorot / 100)}
        </p>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {data.canPurchase ? (
        <Button disabled={!chosen || buying} onClick={() => void buy()}>
          {buying ? 'רגע…' : chosen ? `רכישה · ${formatShekel(chosen.totalAgorot / 100)}` : 'בחרו חבילה'}
        </Button>
      ) : (
        <p className="text-sm text-slate-500">רק בעל הסוכנות יכול לקנות חבילה.</p>
      )}

      <Link to={cancelTo} className="text-sm text-slate-500 hover:text-slate-900">
        ביטול
      </Link>
    </div>
  );
}
