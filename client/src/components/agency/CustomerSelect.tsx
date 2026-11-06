import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { PhoneField } from '@/components/ui/PhoneField';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import {
  createCustomer,
  fetchCustomers,
  type Customer,
  type CustomerKind,
} from '@/services/crm';

/** What a deal needs to remember about the person it was opened for. */
export interface PickedCustomer {
  id: string;
  name: string;
  phone: string | null;
}

const KINDS: { value: CustomerKind; label: string }[] = [
  { value: 'buyer', label: 'קונה' },
  { value: 'seller', label: 'מוכר' },
  { value: 'both', label: 'קונה ומוכר' },
];

interface Props {
  id: string;
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
}

/**
 * Pick a customer by name, phone or email, or add one without leaving the form.
 *
 * The new customer is saved immediately and becomes the selection, so the deal
 * is attached to a real person rather than to a name typed into the title.
 */
export function CustomerSelect({ id, value, onChange }: Props) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '', email: '', kind: 'buyer' as CustomerKind });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: qk.customers.search(debounced),
    queryFn: () => fetchCustomers({ q: debounced || undefined, pageSize: 8 }),
    enabled: value === null && !creating,
  });

  const matches = data?.items ?? [];

  useEffect(() => {
    setHighlighted(0);
  }, [debounced]);

  const choose = (customer: Customer) => {
    onChange({ id: customer.id, name: customer.name, phone: customer.phone });
    setQuery('');
    setOpen(false);
    setCreating(false);
  };

  const startCreating = () => {
    const typed = query.trim();
    const looksLikePhone = /^[\d+\-\s]+$/.test(typed);
    setDraft({
      name: looksLikePhone ? '' : typed,
      phone: looksLikePhone ? typed : '',
      email: '',
      kind: 'buyer',
    });
    setError(null);
    setCreating(true);
    setOpen(false);
  };

  const saveNew = async () => {
    if (draft.phone.trim() === '' && draft.email.trim() === '') {
      setError('צריך טלפון או אימייל — אחרת אי אפשר ליצור קשר.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { data: created } = await createCustomer({
        name: draft.name.trim(),
        phone: draft.phone.trim() || undefined,
        email: draft.email.trim() || undefined,
        kind: draft.kind,
      });
      await queryClient.invalidateQueries({ queryKey: qk.customers.all });
      onChange({ id: created.id, name: created.name, phone: created.phone });
      setCreating(false);
      setQuery('');
    } catch (e) {
      setError(errorMessageOf(e, 'לא הצלחנו ליצור את הלקוח.'));
    } finally {
      setSaving(false);
    }
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-900">{value.name}</div>
          {value.phone && <div className="text-xs text-slate-500">{value.phone}</div>}
        </div>
        <Button type="button" variant="ghost" onClick={() => onChange(null)}>
          שינוי
        </Button>
      </div>
    );
  }

  if (creating) {
    return (
      <div
        className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3"
        onKeyDown={(e) => {
          // This sits inside the deal form. Enter here has to create the customer,
          // not submit a deal that does not know about them yet.
          if (e.key === 'Enter') {
            e.preventDefault();
            void saveNew();
          }
        }}
      >
        <div className="text-sm font-medium text-slate-900">לקוח חדש</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="שם" htmlFor={`${id}-name`} required>
            <input
              id={`${id}-name`}
              required
              autoFocus
              className={inputClass}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>
          <Field label="סוג" htmlFor={`${id}-kind`}>
            <select
              id={`${id}-kind`}
              className={selectClass}
              value={draft.kind}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as CustomerKind }))}
            >
              {KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="טלפון" htmlFor={`${id}-phone`}>
            <PhoneField
              id={`${id}-phone`}
              value={draft.phone}
              onChange={(phone) => setDraft((d) => ({ ...d, phone }))}
            />
          </Field>
          <Field label="אימייל" htmlFor={`${id}-email`}>
            <input
              id={`${id}-email`}
              type="email"
              dir="ltr"
              className={inputClass}
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </Field>
        </div>
        {error && <p className="text-xs text-red-700">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="button" disabled={saving || !draft.name.trim()} onClick={() => void saveNew()}>
            {saving ? 'שומר…' : 'יצירה ובחירה'}
          </Button>
          <button
            type="button"
            className="text-sm text-slate-500 transition hover:text-slate-900"
            onClick={() => {
              setCreating(false);
              setError(null);
            }}
          >
            ביטול
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        aria-controls={`${id}-list`}
        autoComplete="off"
        placeholder="חיפוש לפי שם, טלפון או אימייל"
        className={`${inputClass} w-full`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Wait out the click that chose a row. Blur fires first.
          setTimeout(() => {
            if (!box.current?.contains(document.activeElement)) setOpen(false);
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (open && matches[highlighted]) choose(matches[highlighted]);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setHighlighted((i) => (matches.length === 0 ? 0 : (i + 1) % matches.length));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((i) => (matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length));
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />

      {open && (matches.length > 0 || (debounced !== '' && !isFetching)) && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">לא נמצאו לקוחות</li>
          ) : (
            matches.map((customer, index) => (
              <li key={customer.id} role="option" aria-selected={index === highlighted}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(customer);
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-right text-sm ${
                    index === highlighted ? 'bg-slate-50' : ''
                  }`}
                >
                  <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{customer.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[customer.phone, customer.email].filter(Boolean).join(' · ') || 'בלי פרטי קשר'}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <button
        type="button"
        onClick={startCreating}
        className="mt-2 flex items-center gap-1 text-sm font-medium text-blue-700 transition hover:text-blue-800"
      >
        <Plus className="h-4 w-4" aria-hidden />
        לקוח חדש
      </button>
    </div>
  );
}
