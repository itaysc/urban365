import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatShekel } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  createBankOffer,
  deleteBankOffer,
  deleteMortgageCase,
  fetchMortgageCase,
  updateMortgageCase,
  MORTGAGE_CASE_STAGES,
  type MortgageCaseInput,
  type MortgageCaseStage,
} from '@/services/crm';

/** `''` is "not stated", the same convention `CustomerForm`'s own `num` helper uses. */
const num = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const EMPLOYMENT_TYPES = [
  { value: '', label: '—' },
  { value: 'שכיר', label: 'שכיר/ה' },
  { value: 'עצמאי', label: 'עצמאי/ת' },
  { value: 'גמלאי', label: 'גמלאי/ת' },
];

const RISK_PREFERENCES = [
  { value: '', label: '—' },
  { value: 'שמרני', label: 'שמרני' },
  { value: 'מאוזן', label: 'מאוזן' },
  { value: 'מוכן לסיכון', label: 'מוכן לסיכון' },
];

const OFFER_EMPTY = { bankName: '', track: '', interestRate: '', monthlyPayment: '' };

/**
 * One mortgage file: the intake, and the bank offers logged against it — the tender
 * result an advisor gets back after sending the file to several banks at once.
 */
export function MortgageCaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: qk.mortgageCases.one(caseId!),
    queryFn: () => fetchMortgageCase(caseId!),
    enabled: !!caseId,
  });

  const [saving, setSaving] = useState(false);
  const [offerForm, setOfferForm] = useState(OFFER_EMPTY);
  const [addingOffer, setAddingOffer] = useState(false);

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.mortgageCases.one(caseId!) });

  if (!caseId) return null;
  if (isPending) return <p className="text-sm text-slate-500">טוען…</p>;
  if (!data) return <p className="text-sm text-slate-500">התיק לא נמצא.</p>;

  const who = data.customer?.name ?? data.lead?.name ?? 'ללא שיוך';

  const save = async (patch: Partial<MortgageCaseInput>) => {
    setSaving(true);
    try {
      await updateMortgageCase(caseId, patch);
      await reload();
      toast.success('נשמר.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'השמירה נכשלה.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteMortgageCase(caseId);
      toast.success('התיק נמחק.');
      navigate('/app/mortgage-cases');
    } catch (e) {
      toast.error(errorMessageOf(e, 'המחיקה נכשלה.'));
    }
  };

  const addOffer = async () => {
    if (!offerForm.bankName.trim()) return;
    setAddingOffer(true);
    try {
      await createBankOffer(caseId, {
        bankName: offerForm.bankName.trim(),
        track: offerForm.track.trim() || undefined,
        interestRate: num(offerForm.interestRate),
        monthlyPayment: num(offerForm.monthlyPayment),
      });
      setOfferForm(OFFER_EMPTY);
      await reload();
    } catch (e) {
      toast.error(errorMessageOf(e, 'לא הצלחנו להוסיף את ההצעה.'));
    } finally {
      setAddingOffer(false);
    }
  };

  const removeOffer = async (id: string) => {
    try {
      await deleteBankOffer(caseId, id);
      await reload();
    } catch (e) {
      toast.error(errorMessageOf(e, 'המחיקה נכשלה.'));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/app/mortgage-cases"
          className="flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          חזרה לתיקי משכנתא
        </Link>

        <button
          type="button"
          onClick={() => void remove()}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-500 transition hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          מחיקת תיק
        </button>
      </div>

      <h1 className="text-xl font-bold text-slate-900">{who}</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">פרטי התיק</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="שלב" htmlFor="stage">
            <select
              id="stage"
              className={selectClass}
              value={data.stage}
              disabled={saving}
              onChange={(e) => void save({ stage: e.target.value as MortgageCaseStage })}
            >
              {MORTGAGE_CASE_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="עיר הנכס" htmlFor="propertyCity">
            <input
              id="propertyCity"
              className={inputClass}
              defaultValue={data.propertyCity ?? ''}
              onBlur={(e) => void save({ propertyCity: e.target.value || undefined })}
            />
          </Field>

          <Field label="סכום מבוקש (₪)" htmlFor="requestedAmount">
            <input
              id="requestedAmount"
              type="number"
              inputMode="numeric"
              className={inputClass}
              defaultValue={data.requestedAmount ?? ''}
              onBlur={(e) => void save({ requestedAmount: num(e.target.value) })}
            />
          </Field>

          <Field label="שווי נכס (₪)" htmlFor="propertyValue">
            <input
              id="propertyValue"
              type="number"
              inputMode="numeric"
              className={inputClass}
              defaultValue={data.propertyValue ?? ''}
              onBlur={(e) => void save({ propertyValue: num(e.target.value) })}
            />
          </Field>

          <Field label="הון עצמי פנוי (₪)" htmlFor="equityAvailable">
            <input
              id="equityAvailable"
              type="number"
              inputMode="numeric"
              className={inputClass}
              defaultValue={data.equityAvailable ?? ''}
              onBlur={(e) => void save({ equityAvailable: num(e.target.value) })}
            />
          </Field>

          <Field label="תקופת המשכנתא (שנים)" htmlFor="loanTermYears">
            <input
              id="loanTermYears"
              type="number"
              inputMode="numeric"
              min="1"
              max="40"
              className={inputClass}
              defaultValue={data.loanTermYears ?? ''}
              onBlur={(e) => void save({ loanTermYears: num(e.target.value) })}
            />
          </Field>

          <Field label="הכנסה חודשית — לווה ראשי (₪)" htmlFor="incomePrimary">
            <input
              id="incomePrimary"
              type="number"
              inputMode="numeric"
              className={inputClass}
              defaultValue={data.monthlyIncomePrimary ?? ''}
              onBlur={(e) => void save({ monthlyIncomePrimary: num(e.target.value) })}
            />
          </Field>

          <Field label="הכנסה חודשית — לווה שני (₪)" htmlFor="incomeSecondary">
            <input
              id="incomeSecondary"
              type="number"
              inputMode="numeric"
              className={inputClass}
              defaultValue={data.monthlyIncomeSecondary ?? ''}
              onBlur={(e) => void save({ monthlyIncomeSecondary: num(e.target.value) })}
            />
          </Field>

          <Field label="סוג תעסוקה" htmlFor="employmentType">
            <select
              id="employmentType"
              className={selectClass}
              defaultValue={data.employmentType ?? ''}
              onChange={(e) => void save({ employmentType: e.target.value || undefined })}
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="העדפת סיכון בתמהיל" htmlFor="riskPreference">
            <select
              id="riskPreference"
              className={selectClass}
              defaultValue={data.riskPreference ?? ''}
              onChange={(e) => void save({ riskPreference: e.target.value || undefined })}
            >
              {RISK_PREFERENCES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="הערות" htmlFor="notes">
              <textarea
                id="notes"
                rows={3}
                className={inputClass}
                defaultValue={data.notes ?? ''}
                onBlur={(e) => void save({ notes: e.target.value || undefined })}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">הצעות מהבנקים</h2>

        {data.bankOffers.length === 0 && (
          <p className="text-sm text-slate-500">עוד לא נרשמו הצעות. נשלח התיק למכרז? זה המקום לרשום מה חזר.</p>
        )}

        {data.bankOffers.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2">
            {data.bankOffers.map((offer) => (
              <li
                key={offer.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {offer.bankName}
                    {offer.track ? ` — ${offer.track}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {offer.interestRate !== null ? `${offer.interestRate}% ריבית` : ''}
                    {offer.monthlyPayment !== null ? ` · החזר חודשי ${formatShekel(offer.monthlyPayment)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`מחיקת ההצעה של ${offer.bankName}`}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                  onClick={() => void removeOffer(offer.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="grid gap-2 sm:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            void addOffer();
          }}
        >
          <input
            aria-label="שם הבנק"
            placeholder="בנק"
            className={`${inputClass} sm:col-span-1`}
            value={offerForm.bankName}
            onChange={(e) => setOfferForm((f) => ({ ...f, bankName: e.target.value }))}
          />
          <input
            aria-label="מסלול"
            placeholder="מסלול"
            className={`${inputClass} sm:col-span-1`}
            value={offerForm.track}
            onChange={(e) => setOfferForm((f) => ({ ...f, track: e.target.value }))}
          />
          <input
            aria-label="ריבית"
            placeholder="ריבית %"
            type="number"
            step="0.01"
            className={`${inputClass} sm:col-span-1`}
            value={offerForm.interestRate}
            onChange={(e) => setOfferForm((f) => ({ ...f, interestRate: e.target.value }))}
          />
          <input
            aria-label="החזר חודשי"
            placeholder="החזר חודשי ₪"
            type="number"
            className={`${inputClass} sm:col-span-1`}
            value={offerForm.monthlyPayment}
            onChange={(e) => setOfferForm((f) => ({ ...f, monthlyPayment: e.target.value }))}
          />
          <Button type="submit" disabled={addingOffer || !offerForm.bankName.trim()} className="sm:col-span-1">
            <Plus className="h-4 w-4" aria-hidden />
            הוספת הצעה
          </Button>
        </form>
      </section>
    </div>
  );
}
