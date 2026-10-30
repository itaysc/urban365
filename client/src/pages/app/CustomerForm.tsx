import { useState } from 'react';
import { X } from 'lucide-react';
import { CityBox } from '@/components/listing/CityBox';
import { RoomsPicker } from '@/components/search/RoomsPicker';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { PROPERTY_TYPES } from '@/lib/propertyTypes';
import type { Customer, CustomerInput, CustomerKind } from '@/services/crm';

const KINDS: { value: CustomerKind; label: string }[] = [
  { value: 'buyer', label: 'קונה' },
  { value: 'seller', label: 'מוכר' },
  { value: 'both', label: 'קונה ומוכר' },
];

const SECTIONS = [
  { value: 'forsale', label: 'קנייה' },
  { value: 'rent', label: 'שכירות' },
  { value: 'commercial', label: 'מסחרי' },
];

/** `''` is "not stated", which is a null column — not a zero and not a NaN. */
const num = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

interface Props {
  /** Editing an existing one, or null to add. */
  customer: Customer | null;
  onSubmit: (input: CustomerInput) => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * A customer, and what they are after.
 *
 * The brief uses the same controls as the public search — the city box, the rooms range
 * — because an agent filling it in is describing a search, and the two should not be two
 * different things to learn. It is stored in the same shape too, so "what has come in
 * for this customer" can one day be that search rather than a second implementation.
 */
export function CustomerForm({ customer, onSubmit, onCancel, busy = false }: Props) {
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [kind, setKind] = useState<CustomerKind>(customer?.kind ?? 'buyer');
  const [notes, setNotes] = useState(customer?.notes ?? '');

  const [section, setSection] = useState(customer?.lookingSection ?? '');
  const [cities, setCities] = useState<string[]>(customer?.lookingCities ?? []);
  const [cityDraft, setCityDraft] = useState('');
  const [types, setTypes] = useState<string[]>(customer?.lookingTypes ?? []);
  const [minRooms, setMinRooms] = useState<number | undefined>(customer?.minRooms ?? undefined);
  const [maxRooms, setMaxRooms] = useState<number | undefined>(customer?.maxRooms ?? undefined);
  const [minPrice, setMinPrice] = useState(customer?.minPrice?.toString() ?? '');
  const [maxPrice, setMaxPrice] = useState(customer?.maxPrice?.toString() ?? '');
  const [minSquareMeter, setMinSquareMeter] = useState(customer?.minSquareMeter?.toString() ?? '');

  const [error, setError] = useState<string | null>(null);

  const addCity = (city: string) => {
    const value = city.trim();
    if (value && !cities.includes(value)) setCities([...cities, value]);
    setCityDraft('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    if (phone.trim() === '' && email.trim() === '') {
      // The server refuses this too. Said here because the reason is not obvious from a
      // 400: a customer nobody can reach is a note, not a customer.
      setError('צריך טלפון או אימייל — אחרת אי אפשר ליצור קשר.');
      return;
    }

    setError(null);
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      kind,
      notes: notes.trim(),
      lookingSection: section || undefined,
      lookingCities: cities,
      lookingTypes: types,
      minRooms,
      maxRooms,
      minPrice: num(minPrice),
      maxPrice: num(maxPrice),
      minSquareMeter: num(minSquareMeter),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="שם" htmlFor="customer-name" required>
          <input
            id="customer-name"
            required
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="סוג" htmlFor="customer-kind">
          <select
            id="customer-kind"
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as CustomerKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="טלפון" htmlFor="customer-phone">
          <input
            id="customer-phone"
            dir="ltr"
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>

        <Field label="אימייל" htmlFor="customer-email">
          <input
            id="customer-email"
            type="email"
            dir="ltr"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">מה הם מחפשים</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="סוג עסקה" htmlFor="customer-section">
            <select
              id="customer-section"
              className={selectClass}
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="">לא צוין</option>
              {SECTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>

          {/* Several, because a brief is usually "Holon or Bat Yam" rather than one place. */}
          <Field label="ערים" htmlFor="customer-city">
            <CityBox
              id="customer-city"
              value={cityDraft}
              onChange={(value) => {
                // Picking from the list fills the box in one go, which is the moment to
                // turn it into a chip rather than making them press anything.
                if (value !== cityDraft && value.trim() !== '') addCity(value);
                else setCityDraft(value);
              }}
            />
          </Field>
        </div>

        {cities.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <li key={city}>
                <button
                  type="button"
                  onClick={() => setCities(cities.filter((c) => c !== city))}
                  className="flex items-center gap-1 rounded-full bg-blue-50 py-1 pe-2 ps-3 text-sm text-blue-800 transition hover:bg-blue-100"
                >
                  {city}
                  <X className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">הסרה</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <RoomsPicker
          legend="חדרים"
          min={minRooms}
          max={maxRooms}
          onChange={(next) => {
            setMinRooms(next.min);
            setMaxRooms(next.max);
          }}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="מחיר מ־" htmlFor="customer-min-price">
            <input
              id="customer-min-price"
              type="number"
              min={0}
              step={50000}
              className={inputClass}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
          </Field>
          <Field label="מחיר עד" htmlFor="customer-max-price">
            <input
              id="customer-max-price"
              type="number"
              min={0}
              step={50000}
              className={inputClass}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </Field>
          <Field label="שטח מינימלי (מ״ר)" htmlFor="customer-min-size">
            <input
              id="customer-min-size"
              type="number"
              min={0}
              className={inputClass}
              value={minSquareMeter}
              onChange={(e) => setMinSquareMeter(e.target.value)}
            />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-900">סוג נכס</legend>
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPES.map((type) => {
              const on = types.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setTypes(on ? types.filter((t) => t !== type) : [...types, type])
                  }
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${
                    on
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-900'
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>

      <Field label="הערות" htmlFor="customer-notes">
        <textarea
          id="customer-notes"
          rows={3}
          className={inputClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="מה חשוב להם, מתי הם פנויים לראות, כל מה ששווה לזכור."
        />
      </Field>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || name.trim() === ''}>
          {busy ? 'שומר…' : customer ? 'שמירת שינויים' : 'הוספת לקוח'}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 transition hover:text-slate-900"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
