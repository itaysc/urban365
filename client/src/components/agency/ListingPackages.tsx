import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { useToast } from '@/components/ui/Toast';
import { formatShekel } from '@/lib/format';
import { errorMessageOf } from '@/lib/apiError';
import { buyListingPackage, fetchListingPackages, type ListingPackage } from '@/services/agency';

const labelFor = (pack: ListingPackage) => (pack.size === 1 ? 'פרסום בודד' : `${pack.size} פרסומים`);

/**
 * The packs on the listings page. Hidden entirely while billing is off, which is
 * the default — the server is the one that decides, so the prices never live here.
 */
export function ListingPackages() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: qk.listings.packages,
    queryFn: fetchListingPackages,
  });
  const [pending, setPending] = useState<number | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data?.enabled) return null;

  const buy = async (pack: ListingPackage) => {
    setBuying(true);
    setError(null);
    try {
      await buyListingPackage(pack.size);
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: qk.listings.packages });
      toast.success(
        pack.size === 1 ? 'פרסום אחד נוסף לחשבון.' : `${pack.size} פרסומים נוספו לחשבון.`,
      );
    } catch (e) {
      setError(errorMessageOf(e, 'הרכישה נכשלה.'));
    } finally {
      setBuying(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">יתרת פרסומים</h2>
        <p className="text-sm text-slate-700">
          {data.balance === 0 ? 'אין פרסומים בחשבון' : `נותרו ${data.balance.toLocaleString('he-IL')} פרסומים`}
        </p>
      </div>
      <p className="mt-1 text-xs text-slate-500">כל נכס שמפרסמים מהאפליקציה משתמש בפרסום אחד מהיתרה.</p>

      {data.canPurchase && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.packages.map((pack) => {
            const selected = pending === pack.size;
            return (
              <li key={pack.size}>
                <button
                  type="button"
                  disabled={buying}
                  onClick={() => (selected ? void buy(pack) : setPending(pack.size))}
                  className={`flex h-full w-full flex-col rounded-lg border px-3 py-2 text-right transition disabled:opacity-60 ${
                    selected
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-900 hover:border-slate-900'
                  }`}
                >
                  <span className="text-sm font-medium">{labelFor(pack)}</span>
                  <span className={`text-xs ${selected ? 'text-slate-200' : 'text-slate-500'}`}>
                    {formatShekel(pack.unitAgorot / 100)} לנכס
                    {pack.size > 1 && ` · ${formatShekel(pack.totalAgorot / 100)}`}
                  </span>
                  {selected && <span className="mt-1 text-xs font-semibold">לחיצה נוספת לאישור</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!data.canPurchase && (
        <p className="mt-2 text-xs text-slate-500">רק בעל הסוכנות יכול לקנות חבילה.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
