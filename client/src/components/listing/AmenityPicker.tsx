import { AMENITIES, amenityIcon } from '@/components/listing/amenities';

interface Props {
  selected: string[];
  onToggle: (label: string) => void;
}

/**
 * Picking what a property has.
 *
 * The list and the pictures live next door in `amenities.ts` rather than here, so this
 * file exports a component and nothing else — a module that exports both is one Fast
 * Refresh cannot replace cleanly, and we have already lost an afternoon to that.
 */
export function AmenityPicker({ selected, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {AMENITIES.map((label) => {
        const on = selected.includes(label);
        const Icon = amenityIcon(label);
        return (
          <button
            key={label}
            type="button"
            onClick={() => onToggle(label)}
            aria-pressed={on}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
              on
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-900'
            }`}
          >
            {/* Decorative: the label beside it already says what this is. */}
            <Icon className={`h-4 w-4 ${on ? 'text-white' : 'text-slate-500'}`} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
