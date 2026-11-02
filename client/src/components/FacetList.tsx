import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Facet } from '@/types/search';

interface Props {
  title: string;
  facets: Facet[];
  selected: string[];
  onToggle: (value: string) => void;
  initiallyShown?: number;
  /**
   * A picture for each option, where the options are a closed set worth picturing.
   * Cities and property types are not — there is no icon for חולון — so this is passed
   * only by the lists that have one.
   */
  iconFor?: (value: string) => LucideIcon;
}

/**
 * Checkboxes with the count each option would return under the current filters.
 * A selected option stays visible even when its count drops to zero, so you can always
 * untick it.
 */
export function FacetList({ title, facets, selected, onToggle, initiallyShown = 6, iconFor }: Props) {
  const [expanded, setExpanded] = useState(false);

  const missing = selected.filter((s) => !facets.some((f) => f.value === s)).map((value) => ({ value, count: 0 }));
  const all = [...facets, ...missing];
  if (all.length === 0) return null;

  const shown = expanded ? all : all.slice(0, initiallyShown);

  return (
    <fieldset className="border-t border-slate-100 pt-3">
      <legend className="mb-2 text-sm font-semibold text-slate-900">{title}</legend>

      <ul className="flex flex-col gap-1.5">
        {shown.map((f) => {
          const Icon = iconFor?.(f.value);
          return (
            <li key={f.value}>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selected.includes(f.value)}
                  onChange={() => onToggle(f.value)}
                  className="h-4 w-4 flex-none"
                />
                {Icon && <Icon className="h-4 w-4 flex-none text-slate-500" aria-hidden />}
                <span className="flex-1 truncate">{f.value}</span>
                <span className="text-xs text-slate-500">{f.count}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {all.length > initiallyShown && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs text-blue-700 hover:underline"
        >
          {expanded ? 'הצגה מצומצמת' : `עוד ${all.length - initiallyShown}`}
        </button>
      )}
    </fieldset>
  );
}
