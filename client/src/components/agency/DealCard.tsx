import { GripVertical, Trash2 } from 'lucide-react';
import { selectClass } from '@/components/ui/Field';
import { formatShekel } from '@/lib/format';
import { DEAL_STAGES, type Deal, type DealStage } from '@/services/crm';

interface Props {
  deal: Deal;
  onMove: (stage: DealStage) => void;
  onRemove: () => void;
  /** Set on the board, where a card can be picked up. The list has nowhere to drop it. */
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** True while this card is the one being carried. */
  lifted?: boolean;
}

const TINT: Record<DealStage, string> = {
  qualified: 'border-slate-200',
  negotiation: 'border-blue-200',
  under_contract: 'border-amber-200',
  closed_won: 'border-green-300',
  closed_lost: 'border-slate-200 opacity-70',
};

/**
 * One deal, the same card on the board and in the phone's list.
 *
 * The stage dropdown stays even where the card can be dragged. Dragging is the quick
 * way and the dropdown is the only way for anybody working from a keyboard or a screen
 * reader — a board where the sole means of moving a card is a mouse gesture is a board
 * some people cannot use at all.
 */
export function DealCard({
  deal,
  onMove,
  onRemove,
  draggable = false,
  onDragStart,
  onDragEnd,
  lifted = false,
}: Props) {
  const who = deal.customer?.name ?? deal.lead?.name ?? null;

  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        // The id travels in the drag payload as well as in component state, so a drop
        // knows what it caught even though nothing else reads it.
        e.dataTransfer.setData('text/plain', deal.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`rounded-xl border bg-white p-3 transition ${TINT[deal.stage]} ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${lifted ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        {draggable && (
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
        )}
        <p className="min-w-0 flex-1 break-words text-sm font-medium text-slate-900">{deal.title}</p>
      </div>

      {deal.price !== null && (
        <p className="mt-0.5 text-xs text-slate-600">{formatShekel(deal.price)}</p>
      )}
      {deal.commission !== null && (
        <p className="text-xs text-slate-500">עמלה {formatShekel(deal.commission)}</p>
      )}
      {who && <p className="mt-1 truncate text-xs text-slate-500">{who}</p>}

      <div className="mt-2 flex items-center gap-2">
        <label className="sr-only" htmlFor={`stage-${deal.id}`}>
          שלב העסקה
        </label>
        <select
          id={`stage-${deal.id}`}
          className={`${selectClass} min-w-0 flex-1 py-1 text-xs`}
          value={deal.stage}
          onChange={(e) => onMove(e.target.value as DealStage)}
        >
          {DEAL_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          aria-label={`מחיקת העסקה ${deal.title}`}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-700"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
