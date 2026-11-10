import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus } from 'lucide-react';
import { ArchivePanel } from '@/components/agency/ArchivePanel';
import { DealCard } from '@/components/agency/DealCard';
import { NewDealDialog } from '@/components/agency/NewDealDialog';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { errorMessageOf } from '@/lib/apiError';
import { moveDeal } from '@/lib/dealBoard';
import { formatShekel } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  deleteDeal,
  fetchDealArchive,
  fetchDealBoard,
  restoreDeal,
  updateDeal,
  DEAL_STAGES,
  type Deal,
  type DealBoard,
  type DealStage,
} from '@/services/crm';

/**
 * Below this the pipeline is a list rather than a board.
 *
 * Measured against the window, but what has to fit is the board: five columns want
 * about a thousand pixels between them before a card becomes a column of single words,
 * and the sidebar and the page padding take roughly three hundred before the board
 * gets any. Hence 1280 and not 1024 — at 1024 the columns came out 140px wide, which
 * is narrower than the dropdown inside them.
 *
 * Everything below that, a phone included, gets the same deals stacked by stage. That
 * is not a lesser view: a board is a picture of exactly that, and the picture is the
 * part that needs the room.
 */
const BOARD_FROM = '(min-width: 1280px)';

export function DealsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const board = useMediaQuery(BOARD_FROM);

  const [adding, setAdding] = useState(false);
  const [addingTo, setAddingTo] = useState<DealStage | undefined>();
  /** The card currently being carried, and the column under the cursor. */
  const [lifted, setLifted] = useState<string | null>(null);
  const [over, setOver] = useState<DealStage | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data, isPending } = useQuery({ queryKey: qk.deals.board, queryFn: fetchDealBoard });

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.deals.all });

  /**
   * Move a deal, on screen first and on the server after.
   *
   * The board is replaced locally before the request goes out, because a card that
   * springs back to where it came from for half a second reads as the drop having
   * missed — and the second attempt is what actually produces a double move. A failure
   * puts the old board back and says so.
   */
  const move = async (deal: Deal, stage: DealStage) => {
    if (deal.stage === stage) return;

    const previous = queryClient.getQueryData<DealBoard>(qk.deals.board);
    if (previous) {
      queryClient.setQueryData(qk.deals.board, moveDeal(previous, deal.id, stage));
    }

    try {
      await updateDeal(deal.id, { stage });
      await reload();
    } catch (e) {
      if (previous) queryClient.setQueryData(qk.deals.board, previous);
      toast.error(errorMessageOf(e, 'לא הצלחנו להעביר את העסקה.'));
    }
  };

  const remove = async (deal: Deal) => {
    try {
      await deleteDeal(deal.id);
      toast.success('העסקה הועברה לארכיון.');
      await reload();
    } catch (e) {
      toast.error(errorMessageOf(e, 'ההעברה לארכיון נכשלה.'));
    }
  };

  const openDialog = (stage?: DealStage) => {
    setAddingTo(stage);
    setAdding(true);
  };

  const cardFor = (deal: Deal, draggable: boolean) => (
    <DealCard
      key={deal.id}
      deal={deal}
      draggable={draggable}
      lifted={lifted === deal.id}
      onDragStart={() => setLifted(deal.id)}
      onDragEnd={() => {
        setLifted(null);
        setOver(null);
      }}
      onMove={(stage) => void move(deal, stage)}
      onRemove={() => void remove(deal)}
    />
  );

  return (
    // The board owns the height it is given so its columns can scroll inside it rather
    // than the page scrolling past the headings; the list is an ordinary page.
    <div className={`flex flex-col gap-4 ${board ? 'h-[calc(100vh-9rem)]' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">עסקאות</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden />
            ארכיון
          </Button>
          <Button onClick={() => openDialog()}>
            <Plus className="h-4 w-4" aria-hidden />
            עסקה חדשה
          </Button>
        </div>
      </div>

      <ArchivePanel
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="עסקאות"
        queryKey={qk.deals.archive}
        fetchArchive={fetchDealArchive}
        onRestore={restoreDeal}
        onRestored={reload}
        renderRow={(deal) => (
          <p className="truncate text-sm font-medium text-slate-900">{deal.title}</p>
        )}
      />

      {isPending && <p className="text-sm text-slate-500">טוען…</p>}

      {data && board && (
        /*
         * One scrolling surface for the whole board, not five.
         *
         * Each column used to scroll inside itself, which meant five scrollbars and
         * five different ideas of where "down" was — reading the pipeline across meant
         * putting every column back to the top by hand. This scrolls the board, the way
         * a board does everywhere else, and the headings stay put so a card halfway
         * down is still under a column you can name.
         *
         * `min-h-full` on the grid keeps the columns tall when there is little in them:
         * grid rows stretch their items, so every column is as tall as the fullest one
         * and never shorter than the window — which is what keeps an empty column a
         * target you can drop onto rather than a strip under its own heading.
         */
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full grid-cols-5 gap-3">
            {DEAL_STAGES.map((stage) => {
              const deals = data.columns[stage.value] ?? [];
              const totals = data.totals[stage.value];
              const target = over === stage.value && lifted !== null;

              return (
                <section
                  key={stage.value}
                  // `preventDefault` on dragover is what marks a column as somewhere a
                  // card may be dropped; without it the browser refuses every drop.
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (over !== stage.value) setOver(stage.value);
                  }}
                  onDragLeave={(e) => {
                    // Only when the pointer has left the column itself. Moving between the
                    // cards inside it fires dragleave too, and reacting to that makes the
                    // highlight flicker all the way down the column.
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setOver((current) => (current === stage.value ? null : current));
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);

                    const id = e.dataTransfer.getData('text/plain') || lifted;
                    const deal = id ? findDeal(data, id) : null;
                    if (deal) void move(deal, stage.value);
                  }}
                  className={`flex min-w-0 flex-col rounded-xl border-2 border-dashed p-1 transition ${
                    target ? 'border-blue-400 bg-blue-50' : 'border-transparent'
                  }`}
                >
                  {/* Opaque, because the cards pass behind it. The tint matches the
                      column's own so a drop target stays one colour top to bottom. */}
                  <div
                    className={`sticky top-0 z-10 rounded-lg px-1 pb-1 pt-0.5 ${
                      target ? 'bg-blue-50' : 'bg-slate-50'
                    }`}
                  >
                    <header className="flex items-baseline justify-between gap-1">
                      <h2 className="truncate text-sm font-semibold text-slate-900">{stage.label}</h2>
                      <span className="shrink-0 text-xs text-slate-500">{totals?.count ?? 0}</span>
                    </header>

                    <p className="h-4 text-xs text-slate-500">
                      {totals && totals.value > 0 ? formatShekel(totals.value) : ''}
                    </p>
                  </div>

                  <ul className="mt-1 flex flex-1 flex-col gap-2 p-1">
                    {deals.map((deal) => cardFor(deal, true))}

                    {deals.length === 0 && (
                      <li className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                        ריק
                      </li>
                    )}
                  </ul>

                  <button
                    type="button"
                    onClick={() => openDialog(stage.value)}
                    className="mt-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition hover:bg-white hover:text-slate-900"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    עסקה
                  </button>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {data && !board && (
        <div className="flex flex-col gap-5">
          {DEAL_STAGES.map((stage) => {
            const deals = data.columns[stage.value] ?? [];
            const totals = data.totals[stage.value];

            // An empty stage is a heading over nothing on a screen this narrow, where
            // scrolling past five of them to reach the deals is the whole cost.
            if (deals.length === 0) return null;

            return (
              <section key={stage.value} className="flex flex-col gap-2">
                <header className="flex items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {stage.label}
                    <span className="ms-2 text-xs font-normal text-slate-500">{deals.length}</span>
                  </h2>
                  {totals && totals.value > 0 && (
                    <span className="text-xs text-slate-500">{formatShekel(totals.value)}</span>
                  )}
                </header>

                <ul className="flex flex-col gap-2">{deals.map((deal) => cardFor(deal, false))}</ul>
              </section>
            );
          })}

          {isEmpty(data) && (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              אין עדיין עסקאות.
            </p>
          )}
        </div>
      )}

      <NewDealDialog
        open={adding}
        onOpenChange={setAdding}
        initialStage={addingTo}
        onCreated={() => {
          setAdding(false);
          toast.success('העסקה נוספה.');
          void reload();
        }}
      />
    </div>
  );
}

const findDeal = (board: DealBoard, id: string): Deal | null => {
  for (const stage of DEAL_STAGES) {
    const found = board.columns[stage.value]?.find((deal) => deal.id === id);
    if (found) return found;
  }
  return null;
};

const isEmpty = (board: DealBoard) =>
  DEAL_STAGES.every((stage) => (board.columns[stage.value] ?? []).length === 0);
