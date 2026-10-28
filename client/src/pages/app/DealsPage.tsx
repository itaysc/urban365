import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { formatShekel } from '@/lib/format';
import {
  createDeal,
  deleteDeal,
  fetchDealBoard,
  updateDeal,
  DEAL_STAGES,
  type Deal,
  type DealBoard,
  type DealStage,
} from '@/services/crm';

const STAGE_TINT: Record<DealStage, string> = {
  qualified: 'border-slate-200',
  negotiation: 'border-blue-200',
  under_contract: 'border-amber-200',
  closed_won: 'border-green-300',
  closed_lost: 'border-slate-200 opacity-70',
};

export function DealsPage() {
  const [board, setBoard] = useState<DealBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    void fetchDealBoard()
      .then((b) => {
        setBoard(b);
        setError(null);
      })
      .catch((e) => setError(errorMessageOf(e, 'לא הצלחנו לטעון את העסקאות.')));
  }, []);

  useEffect(load, [load]);

  const move = async (deal: Deal, stage: DealStage) => {
    try {
      await updateDeal(deal.id, { stage });
      load();
    } catch (e) {
      setError(errorMessageOf(e, 'העדכון נכשל.'));
    }
  };

  const remove = async (deal: Deal) => {
    try {
      await deleteDeal(deal.id);
      load();
    } catch (e) {
      setError(errorMessageOf(e, 'המחיקה נכשלה.'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">עסקאות</h1>
        <Button onClick={() => setAdding((a) => !a)}>{adding ? 'ביטול' : 'עסקה חדשה'}</Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {adding && <NewDealForm onCreated={() => { setAdding(false); load(); }} onError={setError} />}

      {!board && <p className="text-sm text-slate-500">טוען…</p>}

      {board && (
        // Columns scroll horizontally rather than wrapping: a pipeline read as five
        // columns stops being a pipeline the moment they stack.
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {DEAL_STAGES.map((stage) => {
            const deals = board.columns[stage.value] ?? [];
            const totals = board.totals[stage.value];

            return (
              <section key={stage.value} className="flex w-64 shrink-0 flex-col gap-2">
                <header className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">{stage.label}</h2>
                  <span className="text-xs text-slate-500">{totals?.count ?? 0}</span>
                </header>

                {totals && totals.value > 0 && (
                  <p className="text-xs text-slate-500">{formatShekel(totals.value)}</p>
                )}

                <ul className="flex flex-col gap-2">
                  {deals.map((deal) => (
                    <li
                      key={deal.id}
                      className={`rounded-xl border bg-white p-3 ${STAGE_TINT[deal.stage]}`}
                    >
                      <p className="text-sm font-medium text-slate-900">{deal.title}</p>

                      {deal.price !== null && (
                        <p className="mt-0.5 text-xs text-slate-600">{formatShekel(deal.price)}</p>
                      )}
                      {deal.commission !== null && (
                        <p className="text-xs text-slate-500">עמלה {formatShekel(deal.commission)}</p>
                      )}
                      {deal.lead && <p className="mt-1 text-xs text-slate-500">{deal.lead.name}</p>}

                      <select
                        className={`${inputClass} mt-2 w-full py-1 text-xs`}
                        value={deal.stage}
                        onChange={(e) => void move(deal, e.target.value as DealStage)}
                      >
                        {DEAL_STAGES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="mt-1 text-xs text-red-700 hover:underline"
                        onClick={() => void remove(deal)}
                      >
                        מחק
                      </button>
                    </li>
                  ))}

                  {deals.length === 0 && (
                    <li className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                      ריק
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewDealForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({ title: '', price: '', commission: '', expectedCloseAt: '' });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setSaving(true);
    try {
      await createDeal({
        title: form.title,
        price: form.price ? Number(form.price) : undefined,
        commission: form.commission ? Number(form.commission) : undefined,
        expectedCloseAt: form.expectedCloseAt || undefined,
      });
      onCreated();
    } catch (e) {
      onError(errorMessageOf(e, 'לא הצלחנו ליצור את העסקה.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="כותרת" htmlFor="deal-title" required>
        <input id="deal-title" required className={inputClass} value={form.title}
               onChange={(e) => set('title', e.target.value)} placeholder="דיזנגוף 120 — משפחת כהן" />
      </Field>
      <Field label="מחיר (₪)" htmlFor="deal-price">
        <input id="deal-price" type="number" inputMode="numeric" className={inputClass}
               value={form.price} onChange={(e) => set('price', e.target.value)} />
      </Field>
      <Field label="עמלה (₪)" htmlFor="deal-commission">
        <input id="deal-commission" type="number" inputMode="numeric" className={inputClass}
               value={form.commission} onChange={(e) => set('commission', e.target.value)} />
      </Field>
      <Field label="צפי סגירה" htmlFor="deal-close">
        <input id="deal-close" type="date" className={inputClass} value={form.expectedCloseAt}
               onChange={(e) => set('expectedCloseAt', e.target.value)} />
      </Field>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving || !form.title.trim()}>
          {saving ? 'שומר…' : 'הוסף'}
        </Button>
      </div>
    </form>
  );
}
