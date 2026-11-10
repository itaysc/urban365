import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus } from 'lucide-react';
import { ArchivePanel } from '@/components/agency/ArchivePanel';
import { MortgageCaseCard } from '@/components/agency/MortgageCaseCard';
import { NewMortgageCaseDialog } from '@/components/agency/NewMortgageCaseDialog';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { errorMessageOf } from '@/lib/apiError';
import { moveMortgageCase } from '@/lib/mortgageCaseBoard';
import { formatShekel } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  deleteMortgageCase,
  fetchMortgageCaseArchive,
  fetchMortgageCaseBoard,
  restoreMortgageCase,
  updateMortgageCase,
  MORTGAGE_CASE_STAGES,
  type MortgageCase,
  type MortgageCaseBoard,
  type MortgageCaseStage,
} from '@/services/crm';

/** Wider than `DealsPage`'s own threshold: seven columns, not five, need the room
 *  before a card stops being a card and becomes a column of single words. */
const BOARD_FROM = '(min-width: 1536px)';

export function MortgageCasesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const board = useMediaQuery(BOARD_FROM);

  const [adding, setAdding] = useState(false);
  const [addingTo, setAddingTo] = useState<MortgageCaseStage | undefined>();
  const [lifted, setLifted] = useState<string | null>(null);
  const [over, setOver] = useState<MortgageCaseStage | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: qk.mortgageCases.board,
    queryFn: fetchMortgageCaseBoard,
  });

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.mortgageCases.all });

  const move = async (item: MortgageCase, stage: MortgageCaseStage) => {
    if (item.stage === stage) return;

    const previous = queryClient.getQueryData<MortgageCaseBoard>(qk.mortgageCases.board);
    if (previous) {
      queryClient.setQueryData(qk.mortgageCases.board, moveMortgageCase(previous, item.id, stage));
    }

    try {
      await updateMortgageCase(item.id, { stage });
      await reload();
    } catch (e) {
      if (previous) queryClient.setQueryData(qk.mortgageCases.board, previous);
      toast.error(errorMessageOf(e, 'לא הצלחנו להעביר את התיק.'));
    }
  };

  const remove = async (item: MortgageCase) => {
    try {
      await deleteMortgageCase(item.id);
      toast.success('התיק הועבר לארכיון.');
      await reload();
    } catch (e) {
      toast.error(errorMessageOf(e, 'ההעברה לארכיון נכשלה.'));
    }
  };

  const openDialog = (stage?: MortgageCaseStage) => {
    setAddingTo(stage);
    setAdding(true);
  };

  const cardFor = (item: MortgageCase, draggable: boolean) => (
    <MortgageCaseCard
      key={item.id}
      mortgageCase={item}
      draggable={draggable}
      lifted={lifted === item.id}
      onDragStart={() => setLifted(item.id)}
      onDragEnd={() => {
        setLifted(null);
        setOver(null);
      }}
      onMove={(stage) => void move(item, stage)}
      onRemove={() => void remove(item)}
    />
  );

  return (
    <div className={`flex flex-col gap-4 ${board ? 'h-[calc(100vh-9rem)]' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">תיקי משכנתא</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden />
            ארכיון
          </Button>
          <Button onClick={() => openDialog()}>
            <Plus className="h-4 w-4" aria-hidden />
            תיק חדש
          </Button>
        </div>
      </div>

      <ArchivePanel
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="תיקי משכנתא"
        queryKey={qk.mortgageCases.archive}
        fetchArchive={fetchMortgageCaseArchive}
        onRestore={restoreMortgageCase}
        onRestored={reload}
        renderRow={(item) => (
          <p className="truncate text-sm font-medium text-slate-900">
            {item.customer?.name ?? item.lead?.name ?? 'ללא שיוך'}
          </p>
        )}
      />

      {isPending && <p className="text-sm text-slate-500">טוען…</p>}

      {data && board && (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full grid-cols-7 gap-3">
            {MORTGAGE_CASE_STAGES.map((stage) => {
              const cases = data.columns[stage.value] ?? [];
              const totals = data.totals[stage.value];
              const target = over === stage.value && lifted !== null;

              return (
                <section
                  key={stage.value}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (over !== stage.value) setOver(stage.value);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setOver((current) => (current === stage.value ? null : current));
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);

                    const id = e.dataTransfer.getData('text/plain') || lifted;
                    const found = id ? findCase(data, id) : null;
                    if (found) void move(found, stage.value);
                  }}
                  className={`flex min-w-0 flex-col rounded-xl border-2 border-dashed p-1 transition ${
                    target ? 'border-blue-400 bg-blue-50' : 'border-transparent'
                  }`}
                >
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
                      {totals && totals.requested > 0 ? formatShekel(totals.requested) : ''}
                    </p>
                  </div>

                  <ul className="mt-1 flex flex-1 flex-col gap-2 p-1">
                    {cases.map((item) => cardFor(item, true))}

                    {cases.length === 0 && (
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
                    תיק
                  </button>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {data && !board && (
        <div className="flex flex-col gap-5">
          {MORTGAGE_CASE_STAGES.map((stage) => {
            const cases = data.columns[stage.value] ?? [];
            const totals = data.totals[stage.value];

            if (cases.length === 0) return null;

            return (
              <section key={stage.value} className="flex flex-col gap-2">
                <header className="flex items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {stage.label}
                    <span className="ms-2 text-xs font-normal text-slate-500">{cases.length}</span>
                  </h2>
                  {totals && totals.requested > 0 && (
                    <span className="text-xs text-slate-500">{formatShekel(totals.requested)}</span>
                  )}
                </header>

                <ul className="flex flex-col gap-2">{cases.map((item) => cardFor(item, false))}</ul>
              </section>
            );
          })}

          {isEmpty(data) && (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              אין עדיין תיקי משכנתא.
            </p>
          )}
        </div>
      )}

      <NewMortgageCaseDialog
        open={adding}
        onOpenChange={setAdding}
        initialStage={addingTo}
        onCreated={() => {
          setAdding(false);
          toast.success('התיק נוסף.');
          void reload();
        }}
      />
    </div>
  );
}

const findCase = (board: MortgageCaseBoard, id: string): MortgageCase | null => {
  for (const stage of MORTGAGE_CASE_STAGES) {
    const found = board.columns[stage.value]?.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
};

const isEmpty = (board: MortgageCaseBoard) =>
  MORTGAGE_CASE_STAGES.every((stage) => (board.columns[stage.value] ?? []).length === 0);
