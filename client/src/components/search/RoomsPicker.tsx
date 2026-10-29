import {
  isStepSelected,
  OPEN_ENDED,
  ROOM_STEPS,
  toggleStep,
  type RoomsRange,
} from '@/components/search/roomsRange';

interface Props {
  min: number | undefined;
  max: number | undefined;
  onChange: (next: RoomsRange) => void;
}

/**
 * Room counts as a row of steps, with the chosen span drawn as one continuous band.
 *
 * Two number fields were the wrong shape for this: rooms are a short, fixed list with
 * half steps, and typing `3` then `5.5` into two boxes is more work than two clicks —
 * and lets you ask for 7.3 rooms, which no listing has.
 */
export function RoomsPicker({ min, max, onChange }: Props) {
  const current: RoomsRange = { min, max };

  // Contiguous by construction, so the selection splits the row into three runs and the
  // middle one can be wrapped in a single band — rather than every step drawing its own
  // border and the run reading as separate pills.
  const below = ROOM_STEPS.filter((step) => !isStepSelected(current, step) && step < (min ?? Infinity));
  const selected = ROOM_STEPS.filter((step) => isStepSelected(current, step));
  const above = ROOM_STEPS.filter((step) => !isStepSelected(current, step) && !below.includes(step));

  const label = (step: number) => (step === OPEN_ENDED ? '+6' : String(step));

  const step = (value: number, inBand: boolean) => (
    <button
      key={value}
      type="button"
      aria-pressed={inBand}
      onClick={() => onChange(toggleStep(current, value))}
      className={`h-9 w-9 shrink-0 rounded-full text-sm transition ${
        inBand
          ? 'font-semibold text-orange-600'
          : 'border border-slate-300 text-slate-700 hover:border-slate-400'
      }`}
    >
      {label(value)}
    </button>
  );

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-900">חדרים</legend>

      {/*
        Scrolls rather than wraps on a narrow screen: wrapping would break the band into
        two pieces and the span would stop reading as one range.
      */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {below.map((value) => step(value, false))}

        {selected.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-orange-500 bg-orange-50 px-1">
            {selected.map((value) => step(value, true))}
          </div>
        )}

        {above.map((value) => step(value, false))}
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {selected.length === 0
          ? 'בחרו מספר חדרים, ולחיצה נוספת תסמן טווח.'
          : 'לחיצה על ערך נוסף תסמן טווח; לחיצה חוזרת תנקה.'}
      </p>
    </fieldset>
  );
}
