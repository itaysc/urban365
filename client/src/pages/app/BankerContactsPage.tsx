import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import {
  createBankerContact,
  deleteBankerContact,
  fetchBankerContacts,
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
  const [saving, setSaving] = useState(false);

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.bankerContacts.all });

  const set = (key: keyof BankerContactInput, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.bankName.trim() || !form.name.trim() || (!form.phone?.trim() && !form.email?.trim())) {
      toast.error('צריך שם בנק, שם איש קשר, וטלפון או אימייל.');
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
      toast.success('איש הקשר נמחק.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'המחיקה נכשלה.'));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold text-slate-900">אנשי קשר בבנקים</h1>

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
            <input
              id="bc-bank"
              className={inputClass}
              value={form.bankName}
              onChange={(e) => set('bankName', e.target.value)}
            />
          </Field>

          <Field label="סניף" htmlFor="bc-branch">
            <input
              id="bc-branch"
              className={inputClass}
              value={form.branch}
              onChange={(e) => set('branch', e.target.value)}
            />
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
