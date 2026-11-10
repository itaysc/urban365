import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus, Trash2 } from 'lucide-react';
import { ArchivePanel } from '@/components/agency/ArchivePanel';
import { SuggestBox } from '@/components/listing/SuggestBox';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { ISRAELI_BANKS, bankLabel, branchLabel } from '@/lib/israeli-banks';
import { qk } from '@/queries/keys';
import {
  createBankerContact,
  deleteBankerContact,
  fetchBankerContactArchive,
  fetchBankerContacts,
  restoreBankerContact,
  type BankerContactInput,
} from '@/services/crm';

const EMPTY: BankerContactInput = { bankName: '', branch: '', name: '', phone: '', email: '' };

/**
 * The personal contacts an advisor actually calls at each bank — the Rolodex beside
 * the pipeline, not part of it. No stage, no assignee: whoever is at the agency sees
 * the same list, the way `TeamPage` shows the same team to everyone.
 */
export function BankerContactsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: qk.bankerContacts.list, queryFn: fetchBankerContacts });

  const [form, setForm] = useState<BankerContactInput>(EMPTY);
  const [bankCode, setBankCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const bank = ISRAELI_BANKS.find((item) => String(item.code) === bankCode);
  const bankOptions = useMemo(() => {
    const labels = ISRAELI_BANKS.map(bankLabel);
    const typed = form.bankName.trim();
    if (!typed || labels.includes(typed)) return labels;
    return labels.filter((label) => label.includes(typed));
  }, [form.bankName]);
  const branchOptions = useMemo(() => {
    if (!bank) return [];
    const labels = bank.branches.map(branchLabel);
    const typed = (form.branch ?? '').trim();
    if (!typed || labels.includes(typed)) return labels.slice(0, 40);
    return labels.filter((label) => label.includes(typed)).slice(0, 40);
  }, [bank, form.branch]);

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.bankerContacts.all });

  const set = (key: keyof BankerContactInput, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const chooseBank = (label: string) => {
    const next = ISRAELI_BANKS.find((item) => bankLabel(item) === label);
    setBankCode(next ? String(next.code) : '');
    setForm((current) => ({ ...current, bankName: label, branch: '' }));
  };

  const submit = async () => {
    if (!bank || !form.name.trim() || (!form.phone?.trim() && !form.email?.trim())) {
      toast.error('צריך לבחור בנק מהרשימה, שם איש קשר, וטלפון או אימייל.');
      return;
    }
    setSaving(true);
    try {
      await createBankerContact({
        bankName: form.bankName.trim(),
        branch: form.branch?.trim() || undefined,
        name: form.name.trim(),
        phone: form.phone?.trim() || undefined,
        email: form.email?.trim() || undefined,
      });
      setForm(EMPTY);
      setBankCode('');
      await reload();
      toast.success('איש הקשר נוסף.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'לא הצלחנו להוסיף את איש הקשר.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteBankerContact(id);
      await reload();
      toast.success('איש הקשר הועבר לארכיון.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'ההעברה לארכיון נכשלה.'));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">אנשי קשר בבנקים</h1>
        <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
          <Archive className="h-4 w-4" aria-hidden />
          ארכיון
        </Button>
      </div>

      <ArchivePanel
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="אנשי קשר בבנקים"
        queryKey={qk.bankerContacts.archive}
        fetchArchive={fetchBankerContactArchive}
        onRestore={restoreBankerContact}
        onRestored={reload}
        renderRow={(contact) => (
          <p className="truncate text-sm font-medium text-slate-900">
            {contact.name}
            <span className="font-normal text-slate-500"> · {contact.bankName}</span>
          </p>
        )}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">הוספת איש קשר</h2>

        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="בנק" htmlFor="bc-bank" required>
            <SuggestBox
              id="bc-bank"
              required
              value={form.bankName}
              onChange={(value) => {
                const next = ISRAELI_BANKS.find((item) => bankLabel(item) === value);
                setBankCode(next ? String(next.code) : '');
                setForm((current) => ({
                  ...current,
                  bankName: value,
                  branch: next ? current.branch ?? '' : '',
                }));
              }}
              onPick={chooseBank}
              options={bankOptions}
              term={form.bankName}
              placeholder="שם או מספר בנק"
            />
          </Field>

          <Field label="סניף" htmlFor="bc-branch">
            {bank ? (
              <SuggestBox
                id="bc-branch"
                value={form.branch ?? ''}
                onChange={(value) => set('branch', value)}
                options={branchOptions}
                term={form.branch ?? ''}
                placeholder="שם, עיר או מספר סניף"
              />
            ) : (
              <input
                id="bc-branch"
                className={`${inputClass} w-full`}
                disabled
                placeholder="קודם בוחרים בנק"
                value=""
              />
            )}
          </Field>

          <Field label="שם איש הקשר" htmlFor="bc-name" required>
            <input
              id="bc-name"
              className={inputClass}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <Field label="טלפון" htmlFor="bc-phone">
            <input
              id="bc-phone"
              className={inputClass}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>

          <Field label="אימייל" htmlFor="bc-email">
            <input
              id="bc-email"
              type="email"
              dir="ltr"
              className={inputClass}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>

          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              <Plus className="h-4 w-4" aria-hidden />
              {saving ? 'שומר…' : 'הוספה'}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">הרשימה</h2>

        {isPending && <p className="text-sm text-slate-500">טוען…</p>}
        {data && data.length === 0 && (
          <p className="text-sm text-slate-500">עוד לא נוספו אנשי קשר.</p>
        )}

        {data && data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {data.map((contact) => (
              <li
                key={contact.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {contact.name}
                    <span className="font-normal text-slate-500"> · {contact.bankName}</span>
                    {contact.branch ? <span className="font-normal text-slate-500"> ({contact.branch})</span> : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[contact.phone, contact.email].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`מחיקת איש הקשר ${contact.name}`}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                  onClick={() => void remove(contact.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
