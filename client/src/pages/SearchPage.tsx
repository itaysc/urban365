import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AssetModal } from '@/components/AssetModal';
import { ListingCard } from '@/components/ListingCard';
import { Pagination } from '@/components/Pagination';
import { SearchFilterPanel } from '@/components/SearchFilterPanel';
import { useListingSearch } from '@/hooks/useListingSearch';
import { useSearchFilters } from '@/hooks/useSearchFilters';
import { fetchListing } from '@/services/search';
import { SORT_LABELS, SORTS, type SearchListing } from '@/types/search';
import type { Asset } from '@/types/yad2';

export function SearchPage() {
  const { filters, update, toggle, reset, activeCount } = useSearchFilters();
  const { status, data, error } = useListingSearch(filters);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [loadingToken, setLoadingToken] = useState<string | null>(null);

  // Detail is fetched on demand: the search response carries only what a card needs.
  const open = useCallback(async (listing: SearchListing) => {
    setLoadingToken(listing.id);
    try {
      const full = await fetchListing(listing.id);
      setSelected(full as unknown as Asset);
    } catch {
      setSelected(null);
    } finally {
      setLoadingToken(null);
    }
  }, []);

  // Scroll to the top only when the *page* changes. This used to depend on `status`,
  // which goes to 'done' after any search — so ticking a filter yanked you to the top,
  // away from the filter you were still using.
  const previousPage = useRef(filters.page);
  useEffect(() => {
    if (previousPage.current === filters.page) return;
    previousPage.current = filters.page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [filters.page]);

  const items = data?.items ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">חיפוש נכסים</h1>
            <p className="text-sm text-slate-500">
              {data ? `${data.total.toLocaleString('he-IL')} נכסים` : 'טוען…'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-blue-700 hover:underline">
              ייבוא סוכנות מיד2 ←
            </Link>
            <select
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as (typeof SORTS)[number] })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              aria-label="מיון"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <SearchFilterPanel
            filters={filters}
            facets={data?.facets}
            activeCount={activeCount}
            onUpdate={update}
            onToggle={toggle}
            onReset={reset}
          />

          <section className="flex flex-col gap-4">
            {status === 'error' && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
                <p className="font-medium">החיפוש נכשל</p>
                <p className="mt-1 text-sm">{error}</p>
              </div>
            )}

            {status === 'done' && items.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                <p className="font-medium text-slate-800">לא נמצאו נכסים</p>
                <p className="mt-1 text-sm text-slate-500">נסו להרחיב את הסינון.</p>
                {activeCount > 0 && (
                  <button type="button" onClick={reset} className="mt-3 text-sm text-blue-700 hover:underline">
                    ניקוי כל הסינונים
                  </button>
                )}
              </div>
            )}

            {/* Results stay on screen while the next page loads, dimmed rather than removed. */}
            <div
              className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${
                status === 'loading' ? 'opacity-50' : 'opacity-100'
              }`}
            >
              {items.map((listing) => (
                <ListingCard key={listing.id} listing={listing} onOpen={open} />
              ))}
            </div>

            {loadingToken && <p className="text-center text-sm text-slate-500">טוען פרטי נכס…</p>}

            {data && data.totalPages > 1 && (
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                onChange={(page) => update({ page })}
              />
            )}
          </section>
        </div>
      </div>

      {selected && <AssetModal asset={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
