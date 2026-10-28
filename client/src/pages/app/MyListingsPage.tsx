import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { Pagination } from '@/components/Pagination';
import { formatPrice } from '@/lib/format';
import { fetchMyListings, type ListingStatus } from '@/services/agency';

/**
 * `label` filters a set, `badge` describes one row — so they differ in number. Reusing
 * the tab label on a single listing's badge made it read "פורסמו" about one property.
 */
const TABS: { value: ListingStatus; label: string; badge: string }[] = [
  { value: 'published', label: 'פורסמו', badge: 'פורסם' },
  { value: 'draft', label: 'טיוטות', badge: 'טיוטה' },
  { value: 'archived', label: 'ארכיון', badge: 'בארכיון' },
];

const isStatus = (value: string | null): value is ListingStatus =>
  TABS.some((tab) => tab.value === value);

const STATUS_BADGE: Record<ListingStatus, string> = {
  published: 'bg-green-100 text-green-800',
  draft: 'bg-amber-100 text-amber-800',
  archived: 'bg-slate-100 text-slate-600',
};

export function MyListingsPage() {
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status: ListingStatus = isStatus(statusParam) ? statusParam : 'published';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  // The key carries the filters, so switching tab or page is a different cache entry
  // rather than a refetch into shared state — and going back to one already fetched is
  // instant. The `cancelled` flag the effect needed is gone: Query ignores the result
  // of a query whose key is no longer mounted.
  const { data, isPending, isError } = useQuery({
    queryKey: qk.listings.mine(status, page),
    queryFn: () => fetchMyListings({ status, page }),
  });

  const loading = isPending;
  const error = isError ? 'לא הצלחנו לטעון את הנכסים.' : null;

  // Changing a tab resets paging; `replace` keeps Back out of a tab-by-tab history.
  const selectStatus = (next: ListingStatus) =>
    setParams({ status: next }, { replace: true, preventScrollReset: true });

  const goToPage = (next: number) =>
    setParams({ status, page: String(next) }, { preventScrollReset: true });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">הנכסים שלי</h1>
        <Link
          to="/app/listings/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          נכס חדש
        </Link>
      </div>

      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => selectStatus(tab.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab.value === status
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {loading && <p className="text-sm text-slate-500">טוען…</p>}

      {!loading && data?.items.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          אין כאן נכסים עדיין.
        </p>
      )}

      {!loading && data && data.items.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {data.items.map((listing) => (
              <li key={listing.id}>
                <Link
                  to={`/app/listings/${listing.id}`}
                  className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-900"
                >
                {listing.coverImageUrl ? (
                  <img
                    src={listing.coverImageUrl}
                    alt=""
                    className="h-16 w-20 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-16 w-20 shrink-0 rounded-lg bg-slate-100" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {[listing.street, listing.city].filter(Boolean).join(', ') || 'ללא כתובת'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[
                      listing.rooms && `${listing.rooms} חדרים`,
                      listing.squareMeter && `${listing.squareMeter} מ״ר`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                <p className="shrink-0 text-sm font-semibold text-slate-900">
                  {formatPrice(listing.price)}
                </p>

                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[listing.status]}`}
                >
                  {TABS.find((t) => t.value === listing.status)?.badge}
                </span>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination page={data.page} totalPages={data.totalPages} onChange={goToPage} />
        </>
      )}
    </div>
  );
}
