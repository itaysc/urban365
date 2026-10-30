import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { inputClass, selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate, formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import { CustomerForm } from '@/pages/app/CustomerForm';
import {
  createCustomer,
  deleteCustomer,
  fetchCustomers,
  updateCustomer,
  type Customer,
  type CustomerInput,
  type CustomerKind,
} from '@/services/crm';

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
  const [page, setPage] = useState(1);

  /** Null means closed; a customer means editing; `'new'` means adding. */
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const { data, isPending } = useQuery({
    queryKey: qk.customers.list(q, kind, page),
    queryFn: () => fetchCustomers({ q: q || undefined, kind, page }),
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
      toast.success('הלקוח נמחק.');
      setDeleting(null);
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו למחוק את הלקוח.')),
  });

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">לקוחות</h1>
          <p className="text-sm text-slate-500">
            {isPending ? 'טוען…' : `${data?.total ?? 0} לקוחות`}
          </p>
        </div>

        {editing === null && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden />
            לקוח חדש
          </Button>
        )}
      </header>

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
          <Search className="absolute inset-y-0 end-3 my-auto h-4 w-4 text-slate-400" aria-hidden />
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
      </div>

      {!isPending && items.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="font-medium text-slate-800">
            {q || kind ? 'אין לקוחות שמתאימים לחיפוש' : 'עדיין אין לקוחות'}
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

                {customer.notes && (
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-500">{customer.notes}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3 text-sm">
                <span className="text-xs text-slate-400">{formatDate(customer.createdAt)}</span>
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
