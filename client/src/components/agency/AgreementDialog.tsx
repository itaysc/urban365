import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { asDateInput } from '@/lib/agreement';
import { errorMessageOf } from '@/lib/apiError';
import { updateCustomer, type Customer } from '@/services/crm';

interface Props {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}

const todayInput = () => new Date().toISOString().slice(0, 10);

/**
 * The brokerage agreement with one customer.
 *
 * Its own dialog rather than four more fields on the customer form, because it answers
 * a different question — not who this person is, but whether the agency can bill for
 * working with them — and because "they signed today" is a thing an agent does on its
 * own, at the door, without wanting to see a brief.
 *
 * Signing is a date and not a tick. An agency asked which version somebody signed, or
 * whether the agreement had expired by the time of the sale, needs the day; a boolean
 * answers neither and cannot be made to later.
 */
export function AgreementDialog({ customer, onClose, onSaved }: Props) {
  const toast = useToast();

  const [signed, setSigned] = useState(false);
  const [date, setDate] = useState('');
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Loaded from the customer during render rather than in an effect, keyed on which
   * customer it is. An effect would paint the previous person's agreement first and
   * replace it a frame later, which on this of all dialogs is the wrong thing to show
   * even briefly.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (customer && customer.id !== loadedFor) {
    setLoadedFor(customer.id);
    setSigned(customer.agreementSignedAt !== null);
    setDate(asDateInput(customer.agreementSignedAt) || todayInput());
    setFee(
      customer.agreementCommissionPercent !== null
        ? String(customer.agreementCommissionPercent)
        : '',
    );
    setNote(customer.agreementNote ?? '');
    setError(null);
  }

  const save = async () => {
    if (!customer) return;

    setSaving(true);
    setError(null);
    try {
      const percent = fee.trim() === '' ? null : Number(fee);

      await updateCustomer(customer.id, {
        // Unticking clears the date rather than keeping a stale one: an agreement that
        // was withdrawn is not an agreement signed on some remembered day.
        agreementSignedAt: signed ? new Date(date).toISOString() : null,
        agreementCommissionPercent: percent,
        agreementCommissionAmount: null,
        agreementNote: note.trim(),
      });

      toast.success(signed ? 'ההסכם נשמר.' : 'נרשם שאין הסכם חתום.');
      onSaved();
    } catch (e) {
      setError(errorMessageOf(e, 'לא הצלחנו לשמור את ההסכם.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={customer !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />

        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl rtl:translate-x-1/2">
          <header className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-slate-900">הסכם תיווך</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                {customer?.name}
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
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={signed}
                onChange={(e) => setSigned(e.target.checked)}
              />
              הלקוח חתם על הסכם תיווך
            </label>

            {signed && (
              <Field label="תאריך החתימה" htmlFor="agreement-date" required>
                <input
                  id="agreement-date"
                  type="date"
                  required
                  className={inputClass}
                  value={date}
                  // Nobody signed next year, and a date typed into the wrong box is the
                  // commonest way this column ends up lying.
                  max={todayInput()}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
            )}

            <Field label="אחוז העמלה שסוכם (%)" htmlFor="agreement-fee">
              <div className="flex items-center gap-2">
                <input
                  id="agreement-fee"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  max="100"
                  placeholder="2"
                  className={`${inputClass} flex-1`}
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
                <span className="text-sm font-medium text-slate-500">%</span>
              </div>
            </Field>
            <p className="-mt-1 text-xs text-slate-500">לפני מע״מ, כפי שההסכם מנוסח.</p>

            <Field label="הערה" htmlFor="agreement-note">
              <input
                id="agreement-note"
                className={inputClass}
                placeholder="היכן מתויק, לאיזה נכס, תוקף"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-1 flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'שומר…' : 'שמירה'}
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
