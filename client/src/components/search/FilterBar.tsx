import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { FacetList } from '@/components/FacetList';
import { amenityIcon } from '@/components/listing/amenities';
import { RangeInputs } from '@/components/RangeInputs';
import { RangeSlider } from '@/components/RangeSlider';
import { PlaceSearchBox } from '@/components/search/PlaceSearchBox';
import { RoomsPicker } from '@/components/search/RoomsPicker';
import { roomsLabel } from '@/components/search/roomsRange';
import { SECTION_LABELS, type SearchFilters, type SearchResponse } from '@/types/search';
import type { Section } from '@/types/yad2';

interface Props {
  filters: SearchFilters;
  facets: SearchResponse['facets'];
  activeCount: number;
  onUpdate: (patch: Partial<SearchFilters>) => void;
  onReset: () => void;
}

const SECTIONS: Section[] = ['forsale', 'rent', 'commercial'];

/**
 * Ends of the two price tracks. A thumb left at the ceiling means no limit, so these
 * sit above the listings we hold rather than cutting the expensive ones out.
 */
const PRICE_SCALE: Record<Section, { floor: number; ceiling: number; step: number }> = {
  forsale: { floor: 0, ceiling: 15_000_000, step: 50_000 },
  rent: { floor: 0, ceiling: 20_000, step: 100 },
  commercial: { floor: 0, ceiling: 5_000_000, step: 25_000 },
};

const PER_SQM_SCALE: Record<Section, { floor: number; ceiling: number; step: number }> = {
  forsale: { floor: 0, ceiling: 100_000, step: 1_000 },
  rent: { floor: 0, ceiling: 200, step: 5 },
  commercial: { floor: 0, ceiling: 30_000, step: 500 },
};

const compact = new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 1 });

/** "עד 3M", "מ־1.5M", "1.5M–3M" — short enough to sit inside a button label. */
function rangeLabel(min: number | undefined, max: number | undefined, format = compact.format): string | null {
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined) return `${format(min)}–${format(max)}`;
  return min !== undefined ? `מ־${format(min)}` : `עד ${format(max as number)}`;
}

/**
 * The widest label a track can produce. Compact notation is not monotonic —
 * "10.1M" is longer than "15M" — so the button is sized to this and a shorter
 * reading does not pull the filters beside it.
 */
function widestRangeLabel(ceiling: number, step: number): string {
  let widest = 'הכול';
  for (let n = step; n <= ceiling; n += step) {
    const both = rangeLabel(n, n);
    if (both && both.length > widest.length) widest = both;
  }
  return widest;
}

const PRICE_LABEL_WIDTH: Record<Section, string> = {
  forsale: widestRangeLabel(PRICE_SCALE.forsale.ceiling, PRICE_SCALE.forsale.step),
  rent: widestRangeLabel(PRICE_SCALE.rent.ceiling, PRICE_SCALE.rent.step),
  commercial: widestRangeLabel(PRICE_SCALE.commercial.ceiling, PRICE_SCALE.commercial.step),
};

/** Drop a bound the new track cannot show. An empty bound is "no limit", which still matches. */
function within(value: number | undefined, ceiling: number): number | undefined {
  if (value === undefined || value > ceiling) return undefined;
  return value;
}

/** "דירה", or "דירה +2" once there are several — the bar has no room for a list. */
function listLabel(values: string[]): string | null {
  if (values.length === 0) return null;
  return values.length === 1 ? values[0] : `${values[0]} +${values.length - 1}`;
}

interface PopoverProps {
  label: string;
  /** The current setting, shown in the trigger so the bar reads without being opened. */
  value: string | null;
  /**
   * A string at least as wide as any value this trigger will show. The slot keeps
   * that width, so the button does not grow and shrink as the number changes.
   */
  reserved?: string;
  /**
   * Panel width, as a CSS length. It is also the minimum and the maximum: the
   * panel used to grow and shrink with whatever was inside it, and a price that
   * went from 0 to 15,000,000 was enough to move the whole box.
   */
  width?: string;
  children: React.ReactNode;
}

/**
 * A labelled trigger with a panel under it.
 *
 * The value sits in the trigger rather than behind it: a row of buttons that all say
 * only `מחיר ⌄` forces you to open each one to find out what the search is currently
 * doing, which is the thing a collapsed filter bar is supposed to save you.
 */
function FilterPopover({ label, value, reserved, width = '18rem', children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // How far the panel has to slide to stay on screen. A panel is anchored to its
  // trigger, so whether it fits depends on where in the bar that trigger ended up —
  // and the bar wraps. The rooms panel is thirty-one rem wide, so on a middling screen
  // it hung off whichever edge it happened to be nearest.
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    if (!open || !panel.current) {
      setShift(0);
      return;
    }

    const EDGE = 8;
    // Measured with the previous shift still applied, so it is removed before working
    // out the new one — otherwise each open would nudge it further.
    const box = panel.current.getBoundingClientRect();
    const left = box.left - shift;
    const right = box.right - shift;

    if (left < EDGE) setShift(EDGE - left);
    else if (right > window.innerWidth - EDGE) setShift(window.innerWidth - EDGE - right);
    else setShift(0);
    // `shift` is read above but must not re-run this, or it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex h-full w-full items-center gap-2 px-4 py-2.5 text-start text-sm transition hover:bg-slate-50 ${
          value ? 'text-slate-900' : 'text-slate-600'
        }`}
      >
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-xs text-slate-500">{label}</span>
          <span className="relative block whitespace-nowrap">
            {reserved && (
              <span className="invisible font-semibold" aria-hidden>
                {reserved}
              </span>
            )}
            <span
              className={`${reserved ? 'absolute inset-x-0 top-0 truncate' : 'truncate'} ${
                value ? 'font-semibold' : 'text-slate-500'
              }`}
            >
              {value ?? 'הכול'}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={panel}
          // Scrolls on its own. The page behind it no longer does, so a panel taller
          // than the viewport — the property-type list is thirty options — had no way
          // to reach its own bottom.
          className="absolute end-0 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
          style={{
            width,
            minWidth: width,
            maxWidth: `min(${width}, calc(100vw - 2rem))`,
            ...(shift === 0 ? {} : { transform: `translateX(${shift}px)` }),
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The filter row that replaces the sidebar once a search is under way.
 *
 * One bordered strip with dividers rather than a row of free-floating pills: it reads
 * as a single control surface, and it keeps the vertical space the sidebar was taking
 * from the results and the map.
 */
export function FilterBar({ filters, facets, activeCount, onUpdate, onReset }: Props) {
  /**
   * Filters are staged here and committed by חפש.
   *
   * They used to apply on every click, which made a range impossible to choose: the
   * first click on the rooms row was already a search for exactly that many rooms, and
   * the results reloaded underneath you before you could pick the other end. Holding
   * them means a whole query is assembled and then run once.
   *
   * `page` is excluded on purpose — paging is not a filter, and it applies immediately.
   */
  const [draft, setDraft] = useState<SearchFilters>(filters);

  // Re-synced whenever the committed filters change from outside: the back button, a
  // reset, a link someone pasted. Keyed on the serialised value rather than the object,
  // which is new on every render of the page above.
  const committed = JSON.stringify(filters);
  useEffect(() => setDraft(filters), [committed]);

  const patch = (next: Partial<SearchFilters>) => setDraft((d) => ({ ...d, ...next }));

  const dirty = JSON.stringify({ ...draft, page: 1 }) !== JSON.stringify({ ...filters, page: 1 });

  const apply = () => {
    // Back to the first page: the tenth page of the previous search means nothing in
    // this one.
    onUpdate({ ...draft, page: 1 });
  };

  const toggleDraft = (
    key: 'city' | 'neighborhood' | 'propertyType' | 'amenities',
    value: string,
  ) => {
    const current = draft[key];
    patch({
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    } as Partial<SearchFilters>);
  };

  const priceScale = PRICE_SCALE[draft.section ?? 'forsale'];
  const perSqmScale = PER_SQM_SCALE[draft.section ?? 'forsale'];

  const extrasCount =
    draft.amenities.length +
    (draft.minSquareMeter !== undefined || draft.maxSquareMeter !== undefined ? 1 : 0) +
    (draft.minPricePerSqm !== undefined || draft.maxPricePerSqm !== undefined ? 1 : 0) +
    (draft.q ? 1 : 0);

  return (
    <form
      className="flex flex-wrap items-stretch gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="min-w-[14rem] flex-1">
        <PlaceSearchBox filters={draft} update={patch} />
      </div>

      {/*
        The dividers only from `sm` up. `divide-x` draws between siblings in DOM order,
        which on a wrapping row means vertical rules in the middle of nothing and what
        looks like an empty cell — the bar read as broken on a phone rather than as a
        bar that had folded.
      */}
      <div className="flex flex-wrap items-stretch gap-y-1 overflow-visible rounded-xl border border-slate-200 bg-white sm:divide-x sm:divide-slate-200 sm:gap-y-0">
        <div className="flex items-center p-1" role="group" aria-label="סוג עסקה">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={draft.section === s}
              onClick={() => {
                // A sale price left on the draft means nothing once the track is a
                // monthly rent, and the slider cannot show a number past its end.
                const nextPrice = PRICE_SCALE[s];
                const nextPerSqm = PER_SQM_SCALE[s];
                patch({
                  section: s,
                  minPrice: within(draft.minPrice, nextPrice.ceiling),
                  maxPrice: within(draft.maxPrice, nextPrice.ceiling),
                  minPricePerSqm: within(draft.minPricePerSqm, nextPerSqm.ceiling),
                  maxPricePerSqm: within(draft.maxPricePerSqm, nextPerSqm.ceiling),
                });
              }}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                draft.section === s
                  ? 'bg-slate-900 font-semibold text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {SECTION_LABELS[s]}
            </button>
          ))}
        </div>

        {/*
          Two states, not three. "All" includes developer-sold apartments rather than
          excluding them, so this only ever narrows — which is why there is no third
          button for second-hand only.
        */}
        <div className="flex items-center p-1" role="group" aria-label="סוג דירה">
          {[
            { value: undefined, label: 'כל הדירות' },
            { value: true, label: 'דירות חדשות' },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={Boolean(draft.isNew) === Boolean(option.value)}
              onClick={() => patch({ isNew: option.value })}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                Boolean(draft.isNew) === Boolean(option.value)
                  ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <FilterPopover
          label="מחיר"
          value={rangeLabel(draft.minPrice, draft.maxPrice)}
          reserved={PRICE_LABEL_WIDTH[draft.section ?? 'forsale']}
          width="24rem"
        >
          <RangeSlider
            title="מחיר"
            suffix="₪"
            {...priceScale}
            min={draft.minPrice}
            max={draft.maxPrice}
            onChange={({ min, max }) => patch({ minPrice: min, maxPrice: max })}
          />
        </FilterPopover>

        <FilterPopover
          label="חדרים"
          value={roomsLabel({ min: draft.minRooms, max: draft.maxRooms })}
          width="31rem"
        >
          <RoomsPicker
            min={draft.minRooms}
            max={draft.maxRooms}
            onChange={({ min, max }) => patch({ minRooms: min, maxRooms: max })}
          />
        </FilterPopover>

        <FilterPopover label="סוג נכס" value={listLabel(draft.propertyType)}>
          <FacetList
            title="סוג נכס"
            facets={facets?.propertyTypes ?? []}
            selected={draft.propertyType}
            onToggle={(v) => toggleDraft('propertyType', v)}
          />
        </FilterPopover>

        <FilterPopover
          label="עוד"
          value={extrasCount > 0 ? `${extrasCount} פעילים` : null}
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-900">חיפוש חופשי</span>
              <input
                value={draft.q ?? ''}
                onChange={(e) => patch({ q: e.target.value || undefined })}
                placeholder="רחוב, תיאור"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </label>

            <RangeSlider
              title="מחיר למ״ר"
              suffix="₪"
              {...perSqmScale}
              min={draft.minPricePerSqm}
              max={draft.maxPricePerSqm}
              onChange={({ min, max }) => patch({ minPricePerSqm: min, maxPricePerSqm: max })}
            />

            <RangeInputs
              title="שטח"
              suffix="מ״ר"
              step={10}
              min={draft.minSquareMeter}
              max={draft.maxSquareMeter}
              onChange={({ min, max }) => patch({ minSquareMeter: min, maxSquareMeter: max })}
            />

            <FacetList
              title="מה יש בנכס"
              facets={facets?.amenities ?? []}
              selected={draft.amenities}
              onToggle={(v) => toggleDraft('amenities', v)}
              initiallyShown={8}
              iconFor={amenityIcon}
            />
          </div>
        </FilterPopover>
      </div>

      {/*
        Submit, so Enter from any field in the bar runs the search too. It stays enabled
        with nothing changed — pressing חפש and getting the same results back is a
        reasonable thing to do, and a button that greys itself out just as you reach for
        it is worse than one that does nothing.
      */}
      <button
        type="submit"
        className={`flex items-center gap-1.5 self-stretch rounded-xl px-5 text-sm font-semibold transition ${
          dirty
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
      >
        <Search className="h-4 w-4" aria-hidden />
        חפש
      </button>

      {activeCount > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 self-stretch rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          ניקוי ({activeCount})
        </button>
      )}
    </form>
  );
}
