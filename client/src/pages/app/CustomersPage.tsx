import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CalendarPlus, ChevronDown, ChevronUp, Mail, Phone, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { inputClass, selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { agreementLabel, agreementTitle, isSigned } from '@/lib/agreement';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate, formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import { CustomerForm } from '@/pages/app/CustomerForm';
import { CustomerViewings } from '@/pages/app/CustomerViewings';
import { MeetingForm } from '@/pages/app/MeetingForm';
import { createMeeting, fetchMeetings, type MeetingInput } from '@/services/calendar';
import {
  createCustomer,
  deleteCustomer,
  fetchCustomerArchive,
  fetchCustomers,
  restoreCustomer,
  updateCustomer,
  type AgreementFilter,
  type Customer,
  type CustomerInput,
  type CustomerKind,
} from '@/services/crm';
import { AgreementDialog } from '@/components/agency/AgreementDialog';
import { ArchivePanel } from '@/components/agency/ArchivePanel';
import { CustomerDeals } from '@/components/agency/CustomerDeals';
import { RecordDocuments } from '@/components/agency/RecordDocuments';

const KIND_LABEL: Record<CustomerKind, string> = {
  buyer: 'קונה',
  seller: 'מוכר',
  both: 'קונה ומוכר',
};

const SECTION_LABEL: Record<string, string> = {
  forsale: 'קנייה',
  rent: 'שכירות',
  commercial: 'מסחרי',
};

const isKind = (value: string): value is CustomerKind => value in KIND_LABEL;

/**
 * What a customer is after, in one line.
 *
 * Built from whatever was filled in rather than printing empty fields: a brief that
 * says "קנייה · חולון, בת ים · 3–4 חדרים" is read at a glance, and one padded out with
 * "מחיר: —" is not read at all.
 */
function brief(customer: Customer): string {
  const parts: string[] = [];

  if (customer.lookingSection) parts.push(SECTION_LABEL[customer.lookingSection] ?? customer.lookingSection);
  if (customer.lookingCities.length) parts.push(customer.lookingCities.join(', '));
  if (customer.lookingTypes.length) parts.push(customer.lookingTypes.join(', '));

  const { minRooms, maxRooms } = customer;
  if (minRooms != null && maxRooms != null) {
    parts.push(minRooms === maxRooms ? `${minRooms} חדרים` : `${minRooms}–${maxRooms} חדרים`);
  } else if (minRooms != null) parts.push(`מ־${minRooms} חדרים`);
  else if (maxRooms != null) parts.push(`עד ${maxRooms} חדרים`);

  const { minPrice, maxPrice } = customer;
  if (minPrice != null && maxPrice != null) parts.push(`${formatPrice(minPrice)}–${formatPrice(maxPrice)}`);
  else if (minPrice != null) parts.push(`מ־${formatPrice(minPrice)}`);
  else if (maxPrice != null) parts.push(`עד ${formatPrice(maxPrice)}`);

  if (customer.minSquareMeter != null) parts.push(`מ־${customer.minSquareMeter} מ״ר`);

  return parts.join(' · ');
}

export function CustomersPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [q, setQ] = useState('');
  const [kind, setKind] = useState<CustomerKind | undefined>();
  /** Narrow to who has signed a brokerage agreement, or to who has not. */
  const [agreement, setAgreement] = useState<AgreementFilter | undefined>();
  /** The customer whose agreement is open for editing. */
  const [agreementFor, setAgreementFor] = useState<Customer | null>(null);
  const [page, setPage] = useState(1);

  /** Null means closed; a customer means editing; `'new'` means adding. */
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  /** The customer a meeting is being booked with, or null when nothing is open. */
  const [booking, setBooking] = useState<Customer | null>(null);
  /** Whose history is open. One at a time: this is a list, not a dashboard. */
  const [showing, setShowing] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: qk.customers.list(q, kind, agreement, page),
    queryFn: () => fetchCustomers({ q: q || undefined, kind, agreement, page }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.customers.all });

  const save = useMutation({
    mutationFn: (input: CustomerInput) =>
      editing && editing !== 'new' ? updateCustomer(editing.id, input) : createCustomer(input),
    onSuccess: () => {
      void refresh();
      toast.success(editing === 'new' ? 'הלקוח נוסף.' : 'הלקוח עודכן.');
      setEditing(null);
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לשמור את הלקוח.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      void refresh();
      toast.success('הלקוח הועבר לארכיון.');
      setDeleting(null);
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו להעביר את הלקוח לארכיון.')),
  });

  const book = useMutation({
    mutationFn: (input: MeetingInput) => createMeeting(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.meetings.all });
      toast.success('הפגישה נקבעה ותופיע ביומן.');
      setBooking(null);
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לקבוע את הפגישה.')),
  });

  const items = data?.items ?? [];

  // Just the next one per customer, which is what a row has space for and what an agent
  // actually wants to see: when am I seeing this person.
  const { data: upcoming } = useQuery({
    queryKey: qk.meetings.forCustomer('all-on-page'),
    queryFn: () =>
      fetchMeetings({
        from: new Date().toISOString(),
        // Far enough ahead to cover a diary, near enough to stay one small query.
        to: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
  });

  const nextWith = (customerId: string) =>
    (upcoming?.items ?? []).find((m) => m.customerId === customerId);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">לקוחות</h1>
          <p className="text-sm text-slate-500">
            {isPending ? 'טוען…' : `${data?.total ?? 0} לקוחות`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden />
            ארכיון
          </Button>
          {editing === null && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              לקוח חדש
            </Button>
          )}
        </div>
      </header>

      <ArchivePanel
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="לקוחות"
        queryKey={qk.customers.archive}
        fetchArchive={fetchCustomerArchive}
        onRestore={restoreCustomer}
        onRestored={refresh}
        renderRow={(customer) => (
          <p className="truncate text-sm font-medium text-slate-900">
            {customer.name}
            {customer.phone ? <span className="font-normal text-slate-500"> · {customer.phone}</span> : null}
          </p>
        )}
      />

      {editing !== null && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-4 font-semibold text-slate-900">
            {editing === 'new' ? 'לקוח חדש' : `עריכת ${editing.name}`}
          </h2>
          <CustomerForm
            customer={editing === 'new' ? null : editing}
            busy={save.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(input) => save.mutate(input)}
          />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 end-3 my-auto h-4 w-4 text-slate-500" aria-hidden />
          <input
            className={`${inputClass} w-full pe-9`}
            placeholder="חיפוש לפי שם, טלפון, אימייל או עיר"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <select
          className={selectClass}
          value={kind ?? ''}
          onChange={(e) => {
            setKind(isKind(e.target.value) ? e.target.value : undefined);
            setPage(1);
          }}
          aria-label="סוג לקוח"
        >
          <option value="">כל הסוגים</option>
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {/* "Who are we working for with nothing in writing" is the question this page
            could not answer before, and the only reason the filter is here. */}
        <select
          className={selectClass}
          value={agreement ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            setAgreement(value === 'signed' || value === 'unsigned' ? value : undefined);
            setPage(1);
          }}
          aria-label="הסכם תיווך"
        >
          <option value="">הסכם תיווך: הכול</option>
          <option value="unsigned">ללא הסכם</option>
          <option value="signed">עם הסכם</option>
        </select>
      </div>

      {!isPending && items.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="font-medium text-slate-800">
            {q || kind || agreement ? 'אין לקוחות שמתאימים לחיפוש' : 'עדיין אין לקוחות'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            כאן נשמרים האנשים שהסוכנות עובדת איתם — מה הם מחפשים, איך משיגים אותם ומה
            חשוב לזכור עליהם.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((customer) => (
          <li key={customer.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{customer.name}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {KIND_LABEL[customer.kind]}
                  </span>

                  {/*
                    State and control in one, like the enquiry status: whether there is
                    an agreement is the thing you scan a list for, and recording one is
                    what you do about it. Amber rather than red for the unsigned —
                    somebody the agency has not signed yet is ordinary, and a page of
                    red would stop meaning anything by the third row.
                  */}
                  <button
                    type="button"
                    onClick={() => setAgreementFor(customer)}
                    title={agreementTitle(customer)}
                    className={`rounded border px-2 py-0.5 text-xs font-medium transition ${
                      isSigned(customer)
                        ? 'border-green-300 bg-green-50 text-green-900 hover:bg-green-100'
                        : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    {agreementLabel(customer)}
                  </button>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  {customer.phone && (
                    // A phone number on a CRM row is there to be rung, so it is a link.
                    <a href={`tel:${customer.phone}`} dir="ltr" className="flex items-center gap-1 hover:text-slate-900">
                      <Phone className="h-3.5 w-3.5" aria-hidden />
                      {customer.phone}
                    </a>
                  )}
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} dir="ltr" className="flex items-center gap-1 hover:text-slate-900">
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                      {customer.email}
                    </a>
                  )}
                </div>

                {brief(customer) && (
                  <p className="mt-2 text-sm text-blue-800">{brief(customer)}</p>
                )}

                {nextWith(customer.id) && (
                  <p className="mt-2 text-sm text-slate-600">
                    הפגישה הבאה:{' '}
                    {new Date(nextWith(customer.id)!.startsAt).toLocaleString('he-IL', {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}

                {customer.notes && (
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-500">{customer.notes}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm [&_a]:py-1.5 [&_button]:py-1.5">
                <span className="text-xs text-slate-500">{formatDate(customer.createdAt)}</span>
                {/*
                  Always offered, not only when there are viewings to count. What is
                  behind it is also where a deal is opened, and a customer nobody has
                  taken anywhere yet is exactly the one an agent wants to start one
                  with — hiding the row from them was the reason the pipeline and the
                  customer list never met.
                */}
                <button
                  type="button"
                  onClick={() => setShowing(showing === customer.id ? null : customer.id)}
                  className="flex items-center gap-1 text-slate-600 hover:text-slate-900"
                >
                  {showing === customer.id ? (
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  )}
                  {customer._count.meetings > 0
                    ? `${customer._count.meetings} ביקורים`
                    : 'ביקורים ועסקאות'}
                </button>
                <button
                  type="button"
                  onClick={() => setBooking(customer)}
                  className="flex items-center gap-1 text-blue-700 hover:underline"
                >
                  <CalendarPlus className="h-4 w-4" aria-hidden />
                  קביעת פגישה
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(customer)}
                  className="text-blue-700 hover:underline"
                >
                  עריכה
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(customer)}
                  className="text-slate-500 hover:text-red-700"
                >
                  מחיקה
                </button>
              </div>
            </div>

            {/* Under the row rather than beside it: an address and a sentence of
                feedback do not fit in a column, and this is what somebody opens the
                row to read. */}
            {showing === customer.id && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <CustomerViewings customerId={customer.id} />
                <CustomerDeals customer={customer} />
                <RecordDocuments subject="customer" subjectId={customer.id} />
              </div>
            )}
          </li>
        ))}
      </ul>

      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="text-blue-700 disabled:text-slate-300"
          >
            הקודם
          </button>
          <span className="text-slate-500">
            {page} מתוך {data?.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= (data?.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
            className="text-blue-700 disabled:text-slate-300"
          >
            הבא
          </button>
        </div>
      )}

      {booking && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <h2 className="mb-4 font-semibold text-slate-900">פגישה עם {booking.name}</h2>
          {/* The customer is fixed, so the form does not offer to choose one. */}
          <MeetingForm
            meeting={null}
            customerId={booking.id}
            busy={book.isPending}
            onCancel={() => setBooking(null)}
            onSubmit={(input) => book.mutate({ ...input, customerId: booking.id })}
          />
        </section>
      )}

      <AgreementDialog
        customer={agreementFor}
        onClose={() => setAgreementFor(null)}
        onSaved={() => {
          setAgreementFor(null);
          void queryClient.invalidateQueries({ queryKey: qk.customers.all });
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="למחוק את הלקוח?"
        description={deleting ? `${deleting.name} יימחק, וגם מה שנרשם עליו.` : undefined}
        confirmLabel="מחיקה"
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}