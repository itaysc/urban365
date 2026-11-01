import type { CoBrokerageStage, CoBrokerageStatus } from '@/services/cobrokerage';

export const STATUS_LABEL: Record<CoBrokerageStatus, string> = {
  pending: 'ממתין לתשובה',
  accepted: 'אושר',
  declined: 'נדחה',
  withdrawn: 'בוטל',
};

export const STATUS_CLASS: Record<CoBrokerageStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  accepted: 'bg-green-50 text-green-800',
  declined: 'bg-slate-100 text-slate-600',
  withdrawn: 'bg-slate-100 text-slate-500',
};

/** In order, because this is a pipeline and the order is the information. */
export const STAGE_LABEL: Record<CoBrokerageStage, string> = {
  agreed: 'סוכם שיתוף פעולה',
  viewing: 'נקבע ביקור',
  negotiating: 'במשא ומתן',
  signed: 'נחתם חוזה',
  completed: 'הושלם',
  fell_through: 'לא יצא לפועל',
};

export const STAGE_CLASS: Record<CoBrokerageStage, string> = {
  agreed: 'bg-blue-50 text-blue-800',
  viewing: 'bg-blue-50 text-blue-800',
  negotiating: 'bg-indigo-50 text-indigo-800',
  signed: 'bg-green-50 text-green-800',
  completed: 'bg-green-100 text-green-900',
  fell_through: 'bg-slate-100 text-slate-600',
};

/**
 * Whether a request is still live.
 *
 * Finished ones are not deleted and not hidden — they move to their own list, because
 * "what happened with that agency in March" is a question agents ask and a product that
 * cannot answer it has thrown away the only record either side has.
 */
export function isSettled(status: CoBrokerageStatus, stage: CoBrokerageStage | null): boolean {
  return (
    status === 'declined' ||
    status === 'withdrawn' ||
    stage === 'completed' ||
    stage === 'fell_through'
  );
}
