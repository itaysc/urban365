import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { selectClass } from '@/components/ui/Field';
import { AssetModal } from '@/components/AssetModal';
import { ListingsMap } from '@/components/map/ListingsMap';
import { FilterBar } from '@/components/search/FilterBar';
import { ListingCard } from '@/components/ListingCard';
import { Pagination } from '@/components/Pagination';
import { useListingSearch } from '@/hooks/useListingSearch';
import { useSearchFilters } from '@/hooks/useSearchFilters';
import { fetchListing, fetchMapPoints, type MapBounds } from '@/services/search';
import { qk } from '@/queries/keys';
import { searchTitle } from '@/lib/searchTitle';
import { SORT_LABELS, SORTS, type SearchListing } from '@/types/search';
import type { Asset } from '@/types/yad2';

/** Hebrew does not take a numeral before a singular noun here. */
function resultCount(total: number | undefined): string {
  if (total === undefined) return 'טוען…';
  if (total === 0) return 'אין תוצאות';
  if (total === 1) return 'תוצאה אחת';
  return `${total.toLocaleString('he-IL')} תוצאות`;
}

export function SearchPage() {
  const { filters, update, toggle, reset, activeCount } = useSearchFilters();
  const { user, logout } = useAuth();
  const { status, data, error } = useListingSearch(filters);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [loadingToken, setLoadingToken] = useState<string | null>(null);

  const [bounds, setBounds] = useState<MapBounds | null>(null);

  // Panning narrows the map query to what is on screen. A *new* search has to drop that
  // narrowing, or choosing a city while the map is parked over somewhere else asks for
  // listings in the old viewport and comes back empty until the map happens to refit.
  // Paging is excluded: the map shows every result, not the page you are reading.
  const { page: _page, ...mapFilters } = filters;
  const mapFilterKey = JSON.stringify(mapFilters);
  useEffect(() => {
    setBounds(null);
  }, [mapFilterKey]);

  const { data: mapData } = useQuery({
    queryKey: [...qk.listings.search(filters), 'map', bounds],
    queryFn: () => fetchMapPoints(filters, bounds ?? undefined),
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
  //
  // Both the column and the window: on a wide screen the results scroll inside their
  // own column and the window has nowhere to go, while on a phone it is the window that
  // scrolls and the column is the full list.
  const results = useRef<HTMLElement>(null);
  const previousPage = useRef(filters.page);
  useEffect(() => {
    if (previousPage.current === filters.page) return;
    previousPage.current = filters.page;
    results.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [filters.page]);

  const items = data?.items ?? [];

  return (
    // On a wide screen the page itself does not scroll: the header and the filters stay
    // put, the results column scrolls on its own and the map stays whole beside it.
    // Scrolling the whole page first pushed both the filters and the map off the top
    // before a single new card appeared. On a phone this is an ordinary page again —
    // one column, nothing to keep beside anything.
    <div className="bg-slate-50 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-8 lg:min-h-0 lg:flex-1">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            {/*
              The heading says what the search is, not what the page is. "חיפוש נכסים"
              is true of this page always and so tells you nothing; the place you asked
              for and the number of answers are the two facts worth the largest type on
              the screen.
            */}
            <h1 className="text-2xl font-bold text-slate-900">{searchTitle(filters)}</h1>
            <p className="text-sm text-slate-500">{resultCount(data?.total)}</p>
          </div>

          <div className="flex items-center gap-3">
            {/*
              Signed in, this has to be the account — not a sign-in link. The login page
              redirects anyone who already has a session, so offering it here sent you to
              /login and straight back, which reads as the link being broken.

              Agencies reach their own sign-in from a link on that page, which is also
              where importing from yad2 lives.
            */}
            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/app/profile"
                  className="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-slate-100"
                  title={`${user.firstName} ${user.lastName}`.trim()}
                >
                  <Avatar size="sm" src={user.avatarUrl} firstName={user.firstName} lastName={user.lastName} />
                  <span className="hidden text-sm text-slate-700 sm:inline">{user.firstName}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="text-sm text-slate-500 transition hover:text-slate-900"
                >
                  יציאה
                </button>
              </div>
            ) : (
              <Link to="/login" className="text-sm text-blue-700 hover:underline">
                התחברות
              </Link>
            )}
            <select
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as (typeof SORTS)[number] })}
              className={selectClass}
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

        {/*
          One filter surface, in both states.

          There used to be a sidebar before the first search and this bar after it, and
          keeping both meant every filter was built twice — which is how the rooms row,
          eleven steps wide, ended up overflowing a sixteen-rem column and sitting on
          top of the results. The bar holds everything the sidebar did, so the sidebar
          is gone and the space it took goes to the results and the map from the start.
        */}
        <FilterBar
          filters={filters}
          facets={data?.facets}
          activeCount={activeCount}
          onUpdate={update}
          onToggle={toggle}
          onReset={reset}
        />

        <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/*
            `min-h-0` is what makes the overflow work at all: a grid item's default
            minimum size is its content, so without it the column grows to fit every
            card and never scrolls.
          */}
          <section ref={results} className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto lg:pe-1">
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
              className={`grid gap-4 transition-opacity xl:grid-cols-2 ${
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

          {/*
            Its own column rather than a view to switch to: the map and the list answer
            different questions about the same results — "where" and "what" — and making
            them alternatives means always being in the wrong one.

            It no longer needs to be sticky — the column it sits in does not scroll —
            so it simply fills the height available. Order is set explicitly because the
            grid's source order puts the map last, and on a phone it belongs above the
            list, not below several screens of cards.
          */}
          <aside className="order-first flex flex-col gap-2 lg:order-none lg:min-h-0">
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <ListingsMap
                points={mapData?.points ?? []}
                boundary={mapData?.boundary}
                onSelect={(id) => void openById(id)}
                onViewportChange={setBounds}
              />

              {mapData?.truncated && (
                <p className="mt-2 text-xs text-amber-700">
                  מוצגים הנכסים הראשונים באזור. התקרבו כדי לראות את כולם.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {selected && <AssetModal asset={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
