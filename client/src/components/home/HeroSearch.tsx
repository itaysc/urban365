import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PlaceSearchBox } from '@/components/search/PlaceSearchBox';
import { EMPTY_FILTERS, type SearchFilters } from '@/types/search';
import type { Section } from '@/types/yad2';

const TABS: { value: Section; label: string }[] = [
  { value: 'forsale', label: 'מכירה' },
  { value: 'rent', label: 'השכרה' },
  { value: 'commercial', label: 'מסחרי' },
];

/**
 * The one thing the home page asks for: where.
 *
 * Deliberately a single box and three tabs. Every filter the results page offers is
 * still there once you arrive, and putting rooms, price and property type on the front
 * door would ask somebody to describe a flat before they have said which city — the
 * wrong order, and a wall of controls to meet a site with.
 *
 * The box itself is the results page's own `PlaceSearchBox`, not a simpler one written
 * for here. It was a plain input to begin with, which meant typing "חולון" sent a
 * string rather than choosing a city — the right places exist, and guessing at them
 * from free text was a worse search *and* a worse heading. Reusing the real one also
 * brings the recent places, the "near me" button and the arrow keys, and means there
 * is one suggestion list in the product rather than two that drift.
 */
export function HeroSearch() {
  const navigate = useNavigate();

  /*
   * A filter set of its own, which only ever holds a section and some places. Nothing
   * reads it but the search button — the home page has no results to filter — so it
   * lives here rather than in the URL, and the URL is written once on submit.
   */
  const [filters, setFilters] = useState<SearchFilters>({ ...EMPTY_FILTERS, section: 'forsale' });
  const update = (patch: Partial<SearchFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));

  const submit = () => {
    const params = new URLSearchParams({ section: filters.section ?? 'forsale' });
    // Comma-separated, which is what the results page reads; see `useSearchFilters`.
    if (filters.city.length > 0) params.set('city', filters.city.join(','));
    if (filters.neighborhood.length > 0) params.set('neighborhood', filters.neighborhood.join(','));
    if (filters.district.length > 0) params.set('district', filters.district.join(','));

    navigate(`/search?${params}`);
  };

  return (
    <div className="w-full max-w-2xl">
      {/*
        The tabs sit on the photograph rather than in a strip inside the search card.
        Nesting them there made three boxes where one would do — a white card holding a
        grey tray holding a dark rectangle — and that stack is what reads as dated.
      */}
      <div className="mb-4 flex justify-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => update({ section: tab.value })}
            aria-pressed={filters.section === tab.value}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              filters.section === tab.value
                ? 'bg-white text-slate-900 shadow-lg'
                : 'bg-white/15 text-white ring-1 ring-inset ring-white/40 backdrop-blur-sm hover:bg-white/25'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* One pill, one action: the suggestion box is the pill rather than a box in it. */}
      <form
        className="flex items-center gap-2 rounded-full bg-white p-2 shadow-2xl ring-1 ring-slate-900/5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="min-w-0 flex-1">
          <PlaceSearchBox
            filters={filters}
            update={update}
            tone="hero"
            placeholder="עיר, שכונה או רחוב"
          />
        </div>

        <button
          type="submit"
          aria-label="חיפוש"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-700 text-white transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          <Search className="h-5 w-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}
