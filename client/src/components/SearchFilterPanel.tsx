import { useEffect, useState } from 'react';
import { FacetList } from '@/components/FacetList';
import { RangeInputs } from '@/components/RangeInputs';
import { RoomsPicker } from '@/components/search/RoomsPicker';
import { SECTION_LABELS, type SearchFilters, type SearchResponse } from '@/types/search';
import type { Section } from '@/types/yad2';

interface Props {
  filters: SearchFilters;
  facets: SearchResponse['facets'];
  activeCount: number;
  onUpdate: (patch: Partial<SearchFilters>) => void;
  onToggle: (key: 'city' | 'propertyType' | 'amenities', value: string) => void;
  onReset: () => void;
}

const SECTIONS: Section[] = ['forsale', 'rent', 'commercial'];

export function SearchFilterPanel({ filters, facets, activeCount, onUpdate, onToggle, onReset }: Props) {
  // Typing is held locally and pushed after a pause, so each keystroke is not a request.
  const [text, setText] = useState(filters.q ?? '');

  useEffect(() => setText(filters.q ?? ''), [filters.q]);

  useEffect(() => {
    const current = filters.q ?? '';
    if (text === current) return;
    const timer = setTimeout(() => onUpdate({ q: text || undefined }), 350);
    return () => clearTimeout(timer);
  }, [text, filters.q, onUpdate]);

  return (
    <aside className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">סינון</h2>
        {activeCount > 0 && (
          <button type="button" onClick={onReset} className="text-xs text-blue-700 hover:underline">
            ניקוי ({activeCount})
          </button>
        )}
      </div>

      <div className="flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="סוג עסקה">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filters.section === s}
            onClick={() => onUpdate({ section: s })}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm ${
              filters.section === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(filters.isNew)}
          onChange={(e) => onUpdate({ isNew: e.target.checked || undefined })}
          className="h-4 w-4 flex-none"
        />
        רק דירות מקבלן
      </label>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="חיפוש חופשי — רחוב, שכונה, תיאור"
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
      />

      <RangeInputs
        title="מחיר"
        suffix="₪"
        step={50000}
        min={filters.minPrice}
        max={filters.maxPrice}
        onChange={({ min, max }) => onUpdate({ minPrice: min, maxPrice: max })}
      />

      <div className="border-t border-slate-100 pt-3">
        <RoomsPicker
          min={filters.minRooms}
          max={filters.maxRooms}
          onChange={({ min, max }) => onUpdate({ minRooms: min, maxRooms: max })}
        />
      </div>

      <RangeInputs
        title="שטח"
        suffix='מ״ר'
        step={10}
        min={filters.minSquareMeter}
        max={filters.maxSquareMeter}
        onChange={({ min, max }) => onUpdate({ minSquareMeter: min, maxSquareMeter: max })}
      />

      <FacetList
        title="עיר"
        facets={facets?.cities ?? []}
        selected={filters.city}
        onToggle={(v) => onToggle('city', v)}
      />

      <FacetList
        title="סוג נכס"
        facets={facets?.propertyTypes ?? []}
        selected={filters.propertyType}
        onToggle={(v) => onToggle('propertyType', v)}
      />

      <FacetList
        title="מה יש בנכס"
        facets={facets?.amenities ?? []}
        selected={filters.amenities}
        onToggle={(v) => onToggle('amenities', v)}
        initiallyShown={8}
      />
    </aside>
  );
}
