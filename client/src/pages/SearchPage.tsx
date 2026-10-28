import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AssetModal } from '@/components/AssetModal';
import { ListingsMap } from '@/components/map/ListingsMap';
import { ListingCard } from '@/components/ListingCard';
import { Pagination } from '@/components/Pagination';
import { SearchFilterPanel } from '@/components/SearchFilterPanel';
import { useListingSearch } from '@/hooks/useListingSearch';
import { useSearchFilters } from '@/hooks/useSearchFilters';
import { fetchListing, fetchMapPoints, type MapBounds } from '@/services/search';
import { qk } from '@/queries/keys';
import { SORT_LABELS, SORTS, type SearchListing } from '@/types/search';
import type { Asset } from '@/types/yad2';

export function SearchPage() {
  const { filters, update, toggle, reset, activeCount } = useSearchFilters();
  const [params, setParams] = useSearchParams();
  const { status, data, error } = useListingSearch(filters);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [loadingToken, setLoadingToken] = useState<string | null>(null);

  // The view lives in the URL like every other filter, so a map someone sends is a map
  // when it is opened.
  const view = params.get('view') === 'map' ? 'map' : 'list';
  const [bounds, setBounds] = useState<MapBounds | null>(null);

  const { data: mapData } = useQuery({
    queryKey: [...qk.listings.search(filters), 'map', bounds],
    queryFn: () => fetchMapPoints(filters, bounds ?? undefined),
    // Only fetched when the map is actually showing — the list view should not pay for
    // a second query it does not render.
    enabled: view === 'map',
  });

  // Detail is fetched on demand: the search response carries only what a card needs.
  // Keyed on the id rather than the whole row, because a map pin has only the id —
  // both views then open the identical modal.
  const openById = useCallback(async (id: string) => {
    setLoadingToken(id);
    try {
      const full = await fetchListing(id);
      setSelected(full as unknown as Asset);
    } catch {
      setSelected(null);
    } finally {
      setLoadingToken(null);
    }
  }, []);

  const open = useCallback((listing: SearchListing) => void openById(listing.id), [openById]);

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
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
              {(['list', 'map'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  onClick={() =>
                    setParams(
                      (p) => {
                        if (option === 'map') p.set('view', 'map');
                        else p.delete('view');
                        return p;
                      },
                      { replace: true, preventScrollReset: true },
                    )
                  }
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    view === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {option === 'list' ? 'רשימה' : 'מפה'}
                </button>
              ))}
            </div>

            {/* The buyer entrance. Agencies reach theirs from a link on that page,
                which is where importing from yad2 lives too. */}
            <Link to="/login" className="text-sm text-blue-700 hover:underline">
              כניסה / הרשמה ←
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

            {view === 'map' ? (
              <div className="flex flex-col gap-2">
                <ListingsMap
                  points={mapData?.points ?? []}
                  onSelect={(id) => void openById(id)}
                  onViewportChange={setBounds}
                />
                {mapData?.truncated && (
                  <p className="text-xs text-amber-700">
                    מוצגים הנכסים הראשונים באזור. התקרבו כדי לראות את כולם.
                  </p>
                )}
                <p className="text-xs text-slate-400">
                  נכסים ללא מיקום מדויק אינם מופיעים על המפה.
                </p>
              </div>
            ) : (
              /* Results stay on screen while the next page loads, dimmed rather than removed. */
              <div
                className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${
                  status === 'loading' ? 'opacity-50' : 'opacity-100'
                }`}
              >
                {items.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} onOpen={open} />
                ))}
              </div>
            )}

            {loadingToken && <p className="text-center text-sm text-slate-500">טוען פרטי נכס…</p>}

            {view === 'list' && data && data.totalPages > 1 && (
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
