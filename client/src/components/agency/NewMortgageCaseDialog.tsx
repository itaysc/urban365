import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { CustomerSelect, type PickedCustomer } from '@/components/agency/CustomerSelect';
import { createMortgageCase, MORTGAGE_CASE_STAGES, type MortgageCaseStage } from '@/services/crm';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  initialStage?: MortgageCaseStage;
}

const EMPTY = { requestedAmount: '', propertyValue: '', propertyCity: '' };

/** Opening a mortgage case, in a dialog — `NewDealDialog`'s own shape and the same
 *  reason: the board stays where it is behind it, whether the form is filled in or
 *  abandoned. */
export function NewMortgageCaseDialog({ open, onOpenChange, onCreated, initialStage }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [stage, setStage] = useState<MortgageCaseStage>(initialStage ?? 'new_request');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const reset = (next: boolean) => {
    if (!next) {
      setForm(EMPTY);
      setCustomer(null);
      setError(null);
      setStage(initialStage ?? 'new_request');
    }
    onOpenChange(next);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await createMortgageCase({
        stage,
        customerId: customer?.id,
        requestedAmount: form.requestedAmount ? Number(form.requestedAmount) : undefined,
        propertyValue: form.propertyValue ? Number(form.propertyValue) : undefined,
        propertyCity: form.propertyCity.trim() || undefined,
      });
      setForm(EMPTY);
      setCustomer(null);
      onCreated();
    } catch (e) {
      setError(errorMessageOf(e, 'לא הצלחנו ליצור את התיק.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />

        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl rtl:translate-x-1/2">
          <header className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-slate-900">תיק משכנתא חדש</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                אפשר להוסיף עכשיו רק את הלקוח, ולמלא את שאר הפרטים בתיק עצמו.
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
              <Field label="לקוח" htmlFor="case-customer">
                <CustomerSelect id="case-customer" value={customer} onChange={setCustomer} />
              </Field>
            </div>

            <Field label="שלב" htmlFor="case-stage">
              <select
                id="case-stage"
                className={selectClass}
                value={stage}
                onChange={(e) => setStage(e.target.value as MortgageCaseStage)}
              >
                {MORTGAGE_CASE_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="עיר הנכס" htmlFor="case-city">
              <input
                id="case-city"
                className={inputClass}
                value={form.propertyCity}
                onChange={(e) => set('propertyCity', e.target.value)}
              />
            </Field>

            <Field label="סכום מבוקש (₪)" htmlFor="case-requested">
              <input
                id="case-requested"
                type="number"
                inputMode="numeric"
                min="0"
                className={inputClass}
                value={form.requestedAmount}
                onChange={(e) => set('requestedAmount', e.target.value)}
              />
            </Field>

            <Field label="שווי נכס (₪)" htmlFor="case-value">
              <input
                id="case-value"
                type="number"
                inputMode="numeric"
                min="0"
                className={inputClass}
                value={form.propertyValue}
                onChange={(e) => set('propertyValue', e.target.value)}
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
                {error}
              </p>
            )}

            <div className="mt-1 flex items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={saving}>
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
