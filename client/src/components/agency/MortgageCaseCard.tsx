import { Link } from 'react-router-dom';
import { GripVertical, Trash2 } from 'lucide-react';
import { selectClass } from '@/components/ui/Field';
import { formatShekel } from '@/lib/format';
import { MORTGAGE_CASE_STAGES, type MortgageCase, type MortgageCaseStage } from '@/services/crm';

interface Props {
  mortgageCase: MortgageCase;
  onMove: (stage: MortgageCaseStage) => void;
  onRemove: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  lifted?: boolean;
}

const TINT: Record<MortgageCaseStage, string> = {
  new_request: 'border-slate-200',
  consultation: 'border-blue-200',
  documents: 'border-blue-200',
  sent_to_banks: 'border-amber-200',
  approved_in_principle: 'border-amber-200',
  signed: 'border-green-300',
  lost: 'border-slate-200 opacity-70',
};

/** One mortgage file, the same card on the board and in the phone's list — `DealCard`'s
 *  own shape, with a link to the case's own page instead of an inline stage-only view:
 *  there is more to a case than a title and a price. */
export function MortgageCaseCard({
  mortgageCase,
  onMove,
  onRemove,
  draggable = false,
  onDragStart,
  onDragEnd,
  lifted = false,
}: Props) {
  const who = mortgageCase.customer?.name ?? mortgageCase.lead?.name ?? 'ללא שיוך';

  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', mortgageCase.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`rounded-xl border bg-white p-3 transition ${TINT[mortgageCase.stage]} ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${lifted ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        {draggable && <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
        <Link
          to={`/app/mortgage-cases/${mortgageCase.id}`}
          className="min-w-0 flex-1 break-words text-sm font-medium text-slate-900 hover:underline"
        >
          {who}
        </Link>
      </div>

      {mortgageCase.requestedAmount !== null && (
        <p className="mt-0.5 text-xs text-slate-600">{formatShekel(mortgageCase.requestedAmount)}</p>
      )}
      {mortgageCase.propertyCity && (
        <p className="text-xs text-slate-500">{mortgageCase.propertyCity}</p>
      )}
      {mortgageCase.bankOffers.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">{mortgageCase.bankOffers.length} הצעות בנק</p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <label className="sr-only" htmlFor={`stage-${mortgageCase.id}`}>
          שלב התיק
        </label>
        <select
          id={`stage-${mortgageCase.id}`}
          className={`${selectClass} min-w-0 flex-1 py-1 text-xs`}
          value={mortgageCase.stage}
          onChange={(e) => onMove(e.target.value as MortgageCaseStage)}
        >
          {MORTGAGE_CASE_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          aria-label={`מחיקת התיק של ${who}`}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-700"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
