import { useEffect, useRef, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { FacetList } from '@/components/FacetList';
import { RangeInputs } from '@/components/RangeInputs';
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
  onToggle: (key: 'city' | 'neighborhood' | 'propertyType' | 'amenities', value: string) => void;
  onReset: () => void;
}

const SECTIONS: Section[] = ['forsale', 'rent', 'commercial'];

const compact = new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 1 });

/** "עד 3M", "מ־1.5M", "1.5M–3M" — short enough to sit inside a button label. */
function rangeLabel(min: number | undefined, max: number | undefined, format = compact.format): string | null {
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined) return `${format(min)}–${format(max)}`;
  return min !== undefined ? `מ־${format(min)}` : `עד ${format(max as number)}`;
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
  /** Panel width. Widened for the rooms row, which is eleven steps across. */
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
function FilterPopover({ label, value, width = 'w-72', children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

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
          <span className="text-xs text-slate-400">{label}</span>
          <span className={`truncate ${value ? 'font-semibold' : 'text-slate-400'}`}>
            {value ?? 'הכול'}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className={`absolute end-0 top-full z-30 mt-1 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-lg ${width}`}
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
export function FilterBar({ filters, facets, activeCount, onUpdate, onToggle, onReset }: Props) {
  // Free text is held locally and pushed after a pause, so each keystroke is not a
  // request — the same arrangement the sidebar used.
  const [text, setText] = useState(filters.q ?? '');
  useEffect(() => setText(filters.q ?? ''), [filters.q]);
  useEffect(() => {
    const current = filters.q ?? '';
    if (text === current) return;
    const timer = setTimeout(() => onUpdate({ q: text || undefined }), 350);
    return () => clearTimeout(timer);
  }, [text, filters.q, onUpdate]);

  const extrasCount =
    filters.amenities.length +
    (filters.minSquareMeter !== undefined || filters.maxSquareMeter !== undefined ? 1 : 0) +
    (filters.q ? 1 : 0);

  return (
    <div className="flex flex-wrap items-stretch gap-3">
      <div className="min-w-[14rem] flex-1">
        <PlaceSearchBox filters={filters} update={onUpdate} />
      </div>

      <div className="flex flex-wrap items-stretch divide-x divide-slate-200 overflow-visible rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center p-1" role="group" aria-label="סוג עסקה">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filters.section === s}
              onClick={() => onUpdate({ section: s })}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                filters.section === s
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
              aria-pressed={Boolean(filters.isNew) === Boolean(option.value)}
              onClick={() => onUpdate({ isNew: option.value })}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                Boolean(filters.isNew) === Boolean(option.value)
                  ? 'bg-orange-50 font-semibold text-orange-700 ring-1 ring-orange-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <FilterPopover label="מחיר" value={rangeLabel(filters.minPrice, filters.maxPrice)}>
          <RangeInputs
            title="מחיר"
            suffix="₪"
            step={50000}
            min={filters.minPrice}
            max={filters.maxPrice}
            onChange={({ min, max }) => onUpdate({ minPrice: min, maxPrice: max })}
          />
        </FilterPopover>

        <FilterPopover
          label="חדרים"
          value={roomsLabel({ min: filters.minRooms, max: filters.maxRooms })}
          width="w-[31rem]"
        >
          <RoomsPicker
            min={filters.minRooms}
            max={filters.maxRooms}
            onChange={({ min, max }) => onUpdate({ minRooms: min, maxRooms: max })}
          />
        </FilterPopover>

        <FilterPopover label="סוג נכס" value={listLabel(filters.propertyType)}>
          <FacetList
            title="סוג נכס"
            facets={facets?.propertyTypes ?? []}
            selected={filters.propertyType}
            onToggle={(v) => onToggle('propertyType', v)}
          />
        </FilterPopover>

        <FilterPopover
          label="עוד"
          value={extrasCount > 0 ? `${extrasCount} פעילים` : null}
        >
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-900">חיפוש חופשי</span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="רחוב, תיאור"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </label>

            <RangeInputs
              title="שטח"
              suffix="מ״ר"
              step={10}
              min={filters.minSquareMeter}
              max={filters.maxSquareMeter}
              onChange={({ min, max }) => onUpdate({ minSquareMeter: min, maxSquareMeter: max })}
            />

            <FacetList
              title="מה יש בנכס"
              facets={facets?.amenities ?? []}
              selected={filters.amenities}
              onToggle={(v) => onToggle('amenities', v)}
              initiallyShown={8}
            />
          </div>
        </FilterPopover>
      </div>

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
    </div>
  );
}
