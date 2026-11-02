import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate, formatPrice } from '@/lib/format';
import {
  createLead,
  deleteLead,
  fetchLeadCounts,
  fetchLeads,
  importLeadsCsv,
  updateLead,
  type ImportResult,
  type Lead,
  type LeadStatus,
} from '@/services/crm';
import { PhoneField } from '@/components/ui/PhoneField';

/**
 * A status, named. One set, used wherever a single enquiry's status is shown.
 *
 * These read as the name of a state rather than as a sentence about the enquiry —
 * `חדש`, not `חדשה` — so nothing here has to agree with the gender of פנייה.
 */
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'חדש',
  contacted: 'נוצר קשר',
  viewing: 'ביקור',
  offer: 'הצעה',
  won: 'נסגר',
  lost: 'אבוד',
};

/** The order they happen in, which is the order the filter chips are read in. */
const STATUS_ORDER: LeadStatus[] = ['new', 'contacted', 'viewing', 'offer', 'won', 'lost'];

/**
 * What a filter chip says, which is `STATUS_LABEL` except where counting changes it.
 *
 * A chip stands for a group — "חדשות (3)" — and only `new` has a plural that differs.
 * Written as an override rather than a second full list, so a status renamed above is
 * renamed in both places.
 */
const CHIP_LABEL: Partial<Record<LeadStatus, string>> = { new: 'חדשות' };

const chipLabel = (status: LeadStatus) => CHIP_LABEL[status] ?? STATUS_LABEL[status];

/**
 * The status as a colour, so a page of enquiries can be read without reading it.
 *
 * `new` is the only one that is a claim on somebody's time, so it is the only one that
 * carries the brand's own blue; `lost` is deliberately grey, because a closed enquiry
 * should recede rather than compete with the three above it that are still live.
 */
const STATUS_TINT: Record<LeadStatus, string> = {
  new: 'border-blue-300 bg-blue-50 text-blue-900',
  contacted: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  viewing: 'border-amber-200 bg-amber-50 text-amber-900',
  offer: 'border-purple-200 bg-purple-50 text-purple-900',
  won: 'border-green-300 bg-green-50 text-green-900',
  lost: 'border-slate-200 bg-slate-100 text-slate-500',
};

const SOURCE_LABEL: Record<Lead['source'], string> = {
  web: 'מהאתר',
  manual: 'ידני',
  import: 'יבוא',
};

const isStatus = (v: string | null): v is LeadStatus => STATUS_ORDER.includes(v as LeadStatus);

export function LeadsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status = isStatus(statusParam) ? statusParam : undefined;
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  /** The enquiry whose status is in flight, so its control cannot be used twice. */
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: qk.leads.list(status, page),
    queryFn: () => fetchLeads({ status, page }),
  });

  // Its own key: the tab counts are shown alongside every page of the list, so they
  // would be refetched on each page change if they shared one.
  const { data: counts = {} } = useQuery({
    queryKey: qk.leads.counts,
    queryFn: fetchLeadCounts,
  });

  const loading = isPending;

  /** Both the list and the counts move whenever a lead does. */
  const reload = () => queryClient.invalidateQueries({ queryKey: qk.leads.all });

  const changeStatus = async (lead: Lead, next: LeadStatus) => {
    setBusy(lead.id);
    try {
      await updateLead(lead.id, { status: next });
      /*
       * Says where it went, not just that something happened.
       *
       * While a filter is on, moving an enquiry out of it takes the row off the screen,
       * and "הסטטוס עודכן" next to a list that is one shorter reads as a deletion. The
       * new status named is the difference between a row vanishing and a row moving.
       */
      toast.success(`${lead.name} — ${STATUS_LABEL[next]}.`);
      await reload();
    } catch (e) {
      const message = errorMessageOf(e, 'העדכון נכשל.');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (lead: Lead) => {
    try {
      await deleteLead(lead.id);
      toast.success('הפנייה נמחקה.');
      await reload();
    } catch (e) {
      const message = errorMessageOf(e, 'המחיקה נכשלה.');
      setError(message);
      toast.error(message);
    }
  };

  const importFile = async (file: File) => {
    try {
      // Read in the browser and post the text: the mapping of Hebrew column names
      // lives on the server, so both this and a future API client agree on it.
      const result = await importLeadsCsv(await file.text());
      setImportResult(result);
      // The panel below keeps the per-row detail; the toast is just the headline, since
      // the panel can be well below the fold on a long inbox.
      toast.success(`יובאו ${result.imported} פניות.`);
      await reload();
    } catch (e) {
      const message = errorMessageOf(e, 'היבוא נכשל.');
      setError(message);
      toast.error(message);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">פניות</h1>

        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])}
          />
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            יבוא מקובץ
          </Button>
          <Button onClick={() => setAdding((a) => !a)}>{adding ? 'ביטול' : 'פנייה חדשה'}</Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {importResult && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <p className="font-medium text-slate-900">יובאו {importResult.imported} פניות.</p>
          {importResult.skipped.length > 0 && (
            <ul className="mt-1 text-xs text-amber-800">
              {importResult.skipped.slice(0, 5).map((s) => (
                <li key={s.row}>
                  שורה {s.row}: {s.reason}
                </li>
              ))}
              {importResult.skipped.length > 5 && <li>ועוד {importResult.skipped.length - 5}…</li>}
            </ul>
          )}
          <button
            type="button"
            className="mt-2 text-xs text-slate-500 hover:underline"
            onClick={() => setImportResult(null)}
          >
            סגור
          </button>
        </div>
      )}

      {adding && (
        <NewLeadForm
          onCreated={() => {
            setAdding(false);
            toast.success('הפנייה נוספה.');
            void reload();
          }}
          onError={setError}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <FilterChip label="הכול" active={!status} onClick={() => setParams({}, { replace: true })} />
        {STATUS_ORDER.map((value) => (
          <FilterChip
            key={value}
            label={`${chipLabel(value)}${counts[value] ? ` (${counts[value]})` : ''}`}
            active={status === value}
            onClick={() => setParams({ status: value }, { replace: true })}
          />
        ))}
      </div>

      {loading && <p className="text-sm text-slate-500">טוען…</p>}

      {!loading && data?.items.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          אין פניות להצגה.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {data?.items.map((lead) => (
          <li key={lead.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{lead.name}</p>
                <p className="text-xs text-slate-500">
                  {[lead.phone, lead.email].filter(Boolean).join(' · ')}
                </p>
                {lead.listing && (
                  <p className="mt-1 text-xs text-slate-600">
                    {[lead.listing.street, lead.listing.city].filter(Boolean).join(', ')}
                    {lead.listing.price && ` · ${formatPrice(lead.listing.price)}`}
                  </p>
                )}
                {lead.message && <p className="mt-1 text-sm text-slate-700">{lead.message}</p>}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/*
                  The status chip *is* the control.
                  
                  It was a bare dropdown at the foot of the card, which told you nothing
                  at a glance and did not look like anything you could press — the
                  status was only legible by reading the one element that could change
                  it. As a tinted chip up here with the source and the date it can be
                  scanned down a page of enquiries, and it is still the select it always
                  was.
                */}
                <label className="sr-only" htmlFor={`status-${lead.id}`}>
                  סטטוס הפנייה של {lead.name}
                </label>
                <select
                  id={`status-${lead.id}`}
                  disabled={busy === lead.id}
                  className={`select-chevron cursor-pointer rounded-md border py-1 ps-2 pe-7 text-xs font-medium transition disabled:opacity-50 ${
                    STATUS_TINT[lead.status]
                  }`}
                  value={lead.status}
                  onChange={(e) => void changeStatus(lead, e.target.value as LeadStatus)}
                >
                  {STATUS_ORDER.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABEL[value]}
                    </option>
                  ))}
                </select>

                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {SOURCE_LABEL[lead.source]}
                </span>
                <span className="text-xs text-slate-500">{formatDate(lead.createdAt)}</span>

                <button
                  type="button"
                  aria-label={`מחיקת הפנייה של ${lead.name}`}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                  onClick={() => void remove(lead)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setParams({ ...(status ? { status } : {}), page: String(page - 1) })}
          >
            הקודם
          </Button>
          <span className="text-slate-500">
            {page} מתוך {data.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= data.totalPages}
            onClick={() => setParams({ ...(status ? { status } : {}), page: String(page + 1) })}
          >
            הבא
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'bg-slate-900 text-white'
          : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-900'
      }`}
    >
      {label}
    </button>
  );
}

function NewLeadForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setSaving(true);
    try {
      await createLead({
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        notes: form.notes || undefined,
      });
      onCreated();
    } catch (e) {
      onError(errorMessageOf(e, 'לא הצלחנו ליצור את הפנייה.'));
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
      <Field label="שם" htmlFor="lead-name" required>
        <input id="lead-name" required className={inputClass} value={form.name}
               onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="טלפון" htmlFor="lead-phone">
        <PhoneField id="lead-phone" value={form.phone} onChange={(v) => set('phone', v)} />
      </Field>
      <Field label="אימייל" htmlFor="lead-email">
        <input id="lead-email" type="email" className={inputClass} value={form.email}
               onChange={(e) => set('email', e.target.value)} />
      </Field>
      <Field label="הערות" htmlFor="lead-notes">
        <input id="lead-notes" className={inputClass} value={form.notes}
               onChange={(e) => set('notes', e.target.value)} />
      </Field>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving || !form.name.trim()}>
          {saving ? 'שומר…' : 'הוסף'}
        </Button>
      </div>
    </form>
  );
}
