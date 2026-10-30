/**
 * The things a listing can have, and the control for picking them.
 *
 * One list in one place: the agency editor and the private-seller form both write to
 * `Listing.amenities`, and the search facets count the exact strings stored — so two
 * copies of this list drifting apart would quietly split one filter into two.
 */
export const AMENITIES = [
  'מעלית',
  'גישה לנכים',
  'מיזוג',
  'מזגן טורנדו',
  'סורגים',
  'מחסן',
  'דוד שמש',
  'משופצת',
  'ממ"ד',
  'מרפסת',
  'ריהוט',
  'מקלט בניין',
  'מקלט קומתי',
  'מטבח כשר',
  'כניסה מיידית',
];

interface Props {
  selected: string[];
  onToggle: (label: string) => void;
}

export function AmenityPicker({ selected, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {AMENITIES.map((label) => {
        const on = selected.includes(label);
        return (
          <button
            key={label}
            type="button"
            onClick={() => onToggle(label)}
            aria-pressed={on}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              on
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-900'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
