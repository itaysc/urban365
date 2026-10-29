/**
 * The room counts offered, in the order they are drawn — 1 at the start, "+6" at the
 * end. Half steps because Israeli listings use them: a חצי חדר is a real room count,
 * not a rounding error.
 */
export const ROOM_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6] as const;

/** The last step is open-ended: six rooms *or more*, so it sets no upper bound. */
export const OPEN_ENDED = ROOM_STEPS[ROOM_STEPS.length - 1];

export interface RoomsRange {
  min?: number;
  max?: number;
}

/**
 * What one click does.
 *
 * Nothing chosen, or a range already spanning more than one step: start again at the
 * step clicked. A single step chosen: extend from it to the one clicked, in whichever
 * direction that is. Clicking the single step already chosen clears it — the only way
 * back to "any" without reaching for a reset button.
 *
 * Returned rather than applied so the rule can be tested without a DOM.
 */
export function toggleStep(current: RoomsRange, step: number): RoomsRange {
  const { min, max } = current;
  // "6+" is stored as a floor with no ceiling, so treat a missing max as that step when
  // deciding what is currently selected.
  const high = max ?? (min === OPEN_ENDED ? OPEN_ENDED : undefined);

  const single = min !== undefined && high !== undefined && min === high;

  if (single && min === step) return {};

  if (single) {
    const low = Math.min(min, step);
    const top = Math.max(min, step);
    return { min: low, max: top === OPEN_ENDED ? undefined : top };
  }

  // No selection, or a span: the click starts a new one.
  return { min: step, max: step === OPEN_ENDED ? undefined : step };
}

/** Whether a step falls inside the current selection, so it draws as part of the band. */
export function isStepSelected(current: RoomsRange, step: number): boolean {
  const { min, max } = current;
  if (min === undefined && max === undefined) return false;
  if (min !== undefined && step < min) return false;
  if (max !== undefined && step > max) return false;
  return true;
}

/** "3", "3–5.5", "+6", "עד 4", "מ־2" — short enough for the filter bar's trigger. */
export function roomsLabel({ min, max }: RoomsRange): string | null {
  if (min === undefined && max === undefined) return null;

  const show = (value: number) => (value === OPEN_ENDED ? '+6' : String(value));

  if (min !== undefined && max === undefined) return min === OPEN_ENDED ? '+6' : `${show(min)}+`;
  if (min === undefined) return `עד ${show(max as number)}`;
  if (min === max) return show(min);
  return `${show(min)}–${show(max as number)}`;
}
