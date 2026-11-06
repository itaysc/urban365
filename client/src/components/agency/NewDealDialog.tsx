import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { CustomerSelect, type PickedCustomer } from '@/components/agency/CustomerSelect';
import { createDeal, DEAL_STAGES, type DealStage } from '@/services/crm';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** The column the button was pressed in, so a deal starts where it was asked for. */
  initialStage?: DealStage;
}

const EMPTY = { title: '', price: '', commissionPercent: '', expectedCloseAt: '' };

/**
 * Opening a deal, in a dialog on every screen.
 *
 * It used to unfold above the board, which pushed five columns down the page every time
 * somebody pressed the button — so the thing you were adding a deal *to* left the
 * screen at the moment you started. A dialog has the opposite property: the board stays
 * where it is and comes back untouched, whether the form was filled in or abandoned.
 */
export function NewDealDialog({ open, onOpenChange, onCreated, initialStage }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [stage, setStage] = useState<DealStage>(initialStage ?? 'qualified');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // Reopening starts clean, including after a failure: the alternative is a dialog that
  // remembers a deal somebody decided not to open.
  const reset = (next: boolean) => {
    if (!next) {
      setForm(EMPTY);
      setCustomer(null);
      setError(null);
      setStage(initialStage ?? 'qualified');
    }
    onOpenChange(next);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await createDeal({
        title: form.title.trim(),
        stage,
        price: form.price ? Number(form.price) : undefined,
        commissionPercent: form.commissionPercent ? Number(form.commissionPercent) : undefined,
        expectedCloseAt: form.expectedCloseAt || undefined,
        customerId: customer?.id,
      });
      setForm(EMPTY);
      setCustomer(null);
      onCreated();
    } catch (e) {
      // Shown in the dialog rather than behind it, where somebody looking at the form
      // they just submitted would never see it.
      setError(errorMessageOf(e, 'לא הצלחנו ליצור את העסקה.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />

        {/* Centred with a translate rather than flex, so a short window scrolls the
            panel and not the overlay with it. */}
        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl rtl:translate-x-1/2">
          <header className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-slate-900">עסקה חדשה</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                אפשר להוסיף עכשיו רק כותרת, ולמלא את השאר כשיתברר.
              </Dialog.Description>
            </div>

            <Dialog.Close
              aria-label="סגירה"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </header>

          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="sm:col-span-2">
              <Field label="כותרת" htmlFor="deal-title" required>
                <input
                  id="deal-title"
                  required
                  autoFocus
                  className={inputClass}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="דיזנגוף 120 — משפחת כהן"
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="לקוח" htmlFor="deal-customer">
                <CustomerSelect id="deal-customer" value={customer} onChange={setCustomer} />
              </Field>
            </div>

            <Field label="שלב" htmlFor="deal-stage">
              <select
                id="deal-stage"
                className={selectClass}
                value={stage}
                onChange={(e) => setStage(e.target.value as DealStage)}
              >
                {DEAL_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="צפי סגירה" htmlFor="deal-close">
              <input
                id="deal-close"
                type="date"
                className={inputClass}
                value={form.expectedCloseAt}
                onChange={(e) => set('expectedCloseAt', e.target.value)}
              />
            </Field>

            <Field label="מחיר (₪)" htmlFor="deal-price">
              <input
                id="deal-price"
                type="number"
                inputMode="numeric"
                min="0"
                className={inputClass}
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
              />
            </Field>

            <Field label="עמלה (%)" htmlFor="deal-commission">
              <input
                id="deal-commission"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.1"
                placeholder="2"
                className={inputClass}
                value={form.commissionPercent}
                onChange={(e) => set('commissionPercent', e.target.value)}
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
                {error}
              </p>
            )}

            <div className="mt-1 flex items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={saving || !form.title.trim()}>
                {saving ? 'שומר…' : 'הוספה'}
              </Button>
              <Dialog.Close className="text-sm text-slate-500 transition hover:text-slate-900">
                ביטול
              </Dialog.Close>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
