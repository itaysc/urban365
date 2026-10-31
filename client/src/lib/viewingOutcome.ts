import type { ViewingOutcome } from '@/services/calendar';

/**
 * How a viewing went, said in Hebrew and coloured.
 *
 * Apart from the form that collects it, so that file exports a component and nothing
 * else — a module exporting both is one Fast Refresh cannot replace cleanly.
 */
export const OUTCOME_LABEL: Record<ViewingOutcome, string> = {
  interested: 'מעוניין',
  thinking: 'שוקל',
  not_interested: 'לא מעוניין',
  no_show: 'לא הגיע',
};

/** Green for a lead worth chasing, red for a wasted trip, grey for a clear no. */
export const OUTCOME_CLASS: Record<ViewingOutcome, string> = {
  interested: 'bg-green-50 text-green-800',
  thinking: 'bg-amber-50 text-amber-800',
  not_interested: 'bg-slate-100 text-slate-700',
  no_show: 'bg-red-50 text-red-800',
};

/** The same colours as a selected chip, which needs a border as well as a fill. */
export const OUTCOME_SELECTED: Record<ViewingOutcome, string> = {
  interested: 'border-green-500 bg-green-50 text-green-800',
  thinking: 'border-amber-500 bg-amber-50 text-amber-800',
  not_interested: 'border-slate-500 bg-slate-100 text-slate-800',
  no_show: 'border-red-500 bg-red-50 text-red-800',
};
