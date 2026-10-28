import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ImageManager } from '@/components/listing/ImageManager';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import {
  archiveListing,
  createListing,
  fetchListing,
  updateListing,
  type ListingDetail,
  type ListingInput,
} from '@/services/agency';

const SECTIONS = [
  { value: 'forsale', label: 'למכירה' },
  { value: 'rent', label: 'להשכרה' },
  { value: 'commercial', label: 'מסחרי' },
];

/**
 * Exactly the labels the scraper writes, so a manual listing filters alongside scraped
 * ones and the detail modal can map them back to yad2's flags. Anything else here would
 * store a label no facet and no modal recognises — "מזגן" instead of "מיזוג" silently
 * creates a second, near-duplicate facet.
 *
 * Parking is absent on purpose: it is a count field above, not a yes/no.
 */
const AMENITIES = [
  'מעלית',
  'גישה לנכים',
  'מיזוג',
  'מזגן טורנדו',
  'סורגים',
  'מחסן',
  'דוד שמש',
  'משופצת',
  'ממ"ד',
  'מרפסת',
  'ריהוט',
  'מקלט בניין',
  'מקלט קומתי',
  'מטבח כשר',
  'בלעדיות',
  'כניסה מיידית',
];

type Form = Record<string, string>;

const EMPTY: Form = {
  section: 'forsale',
  price: '',
  rooms: '',
  squareMeter: '',
  floor: '',
  buildingTopFloor: '',
  balconiesCount: '',
  parkingSpacesCount: '',
  propertyType: '',
  propertyCondition: '',
  city: '',
  neighborhood: '',
  street: '',
  houseNumber: '',
  description: '',
  contactName: '',
  brokerName: '',
};

const NUMERIC = new Set([
  'price',
  'rooms',
  'squareMeter',
  'floor',
  'buildingTopFloor',
  'balconiesCount',
  'parkingSpacesCount',
  'houseNumber',
]);

function toForm(listing: ListingDetail): Form {
  const form = { ...EMPTY, section: listing.section };
  for (const key of Object.keys(EMPTY)) {
    if (key === 'section') continue;
    const value = (listing as unknown as Record<string, unknown>)[key];
    form[key] = value === null || value === undefined ? '' : String(value);
  }
  return form;
}

/**
 * Plain `useState` rather than formik — the house split puts formik on the auth forms
 * only, and this form is mostly numeric fields with no cross-field rules.
 */
function toInput(form: Form, amenities: string[]): ListingInput {
  const input: Record<string, unknown> = { section: form.section, amenities };

  for (const [key, raw] of Object.entries(form)) {
    if (key === 'section') continue;
    const value = raw.trim();
    // An empty box means "not stated", which is a null column — not a zero, and not a
    // NaN from Number('').
    if (value === '') continue;
    input[key] = NUMERIC.has(key) ? Number(value) : value;
  }

  return input as unknown as ListingInput;
}

export function ListingEditorPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !listingId || listingId === 'new';

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    setLoading(true);

    void fetchListing(listingId)
      .then((result) => {
        if (cancelled) return;
        setListing(result);
        setForm(toForm(result));
        setAmenities(result.amenities ?? []);
      })
      .catch((e) => !cancelled && setError(errorMessageOf(e, 'הנכס לא נמצא.')))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [isNew, listingId]);

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const toggleAmenity = (label: string) => {
    setAmenities((current) =>
      current.includes(label) ? current.filter((a) => a !== label) : [...current, label],
    );
    setSaved(false);
  };

  const save = async (status?: 'draft' | 'published') => {
    setSaving(true);
    setError(null);

    try {
      const input = { ...toInput(form, amenities), ...(status ? { status } : {}) };

      if (isNew) {
        const created = await createListing(input);
        toast.success(status === 'published' ? 'הנכס נוצר ופורסם.' : 'הנכס נוצר.');
        // replace, not push: Back from a saved listing should reach the list, not the
        // empty form that no longer applies.
        navigate(`/app/listings/${created.id}`, { replace: true });
        return;
      }

      const updated = await updateListing(listingId, input);
      setListing(updated);
      setForm(toForm(updated));
      setSaved(true);
      toast.success(
        status === 'published' ? 'הנכס פורסם.' : status === 'draft' ? 'הנכס הוסר מפרסום.' : 'הנכס נשמר.',
      );
    } catch (e) {
      const message = errorMessageOf(e, 'השמירה נכשלה.');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    setConfirmArchive(false);
    try {
      await archiveListing(listingId!);
      toast.success('הנכס הועבר לארכיון.');
      navigate('/app/listings?status=archived');
    } catch (e) {
      const message = errorMessageOf(e, 'לא הצלחנו להעביר לארכיון.');
      setError(message);
      toast.error(message);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">טוען…</p>;

  const published = listing?.status === 'published';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">{isNew ? 'נכס חדש' : 'עריכת נכס'}</h1>

        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-700">נשמר</span>}
          {listing && (
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                published ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {published ? 'מפורסם' : listing.status === 'draft' ? 'טיוטה' : 'בארכיון'}
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Field label="סוג עסקה" htmlFor="section" required>
          <select
            id="section"
            className={inputClass}
            value={form.section}
            onChange={(e) => set('section', e.target.value)}
          >
            {SECTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="סוג נכס" htmlFor="propertyType">
          <input
            id="propertyType"
            className={inputClass}
            value={form.propertyType}
            onChange={(e) => set('propertyType', e.target.value)}
            placeholder="דירה, פנטהאוז, מגרש…"
          />
        </Field>

        <Field label="מחיר (₪)" htmlFor="price">
          <input id="price" type="number" inputMode="numeric" className={inputClass}
                 value={form.price} onChange={(e) => set('price', e.target.value)} />
        </Field>

        <Field label="שטח (מ״ר)" htmlFor="squareMeter">
          <input id="squareMeter" type="number" inputMode="numeric" className={inputClass}
                 value={form.squareMeter} onChange={(e) => set('squareMeter', e.target.value)} />
        </Field>

        <Field label="חדרים" htmlFor="rooms">
          <input id="rooms" type="number" step="0.5" inputMode="decimal" className={inputClass}
                 value={form.rooms} onChange={(e) => set('rooms', e.target.value)} />
        </Field>

        <Field label="קומה" htmlFor="floor">
          <input id="floor" type="number" inputMode="numeric" className={inputClass}
                 value={form.floor} onChange={(e) => set('floor', e.target.value)} />
        </Field>

        <Field label="מתוך קומות" htmlFor="buildingTopFloor">
          <input id="buildingTopFloor" type="number" inputMode="numeric" className={inputClass}
                 value={form.buildingTopFloor} onChange={(e) => set('buildingTopFloor', e.target.value)} />
        </Field>

        <Field label="מרפסות" htmlFor="balconiesCount">
          <input id="balconiesCount" type="number" inputMode="numeric" className={inputClass}
                 value={form.balconiesCount} onChange={(e) => set('balconiesCount', e.target.value)} />
        </Field>

        <Field label="חניות" htmlFor="parkingSpacesCount">
          <input id="parkingSpacesCount" type="number" inputMode="numeric" className={inputClass}
                 value={form.parkingSpacesCount} onChange={(e) => set('parkingSpacesCount', e.target.value)} />
        </Field>

        <Field label="מצב הנכס" htmlFor="propertyCondition">
          <input id="propertyCondition" className={inputClass} value={form.propertyCondition}
                 onChange={(e) => set('propertyCondition', e.target.value)} placeholder="חדש, משופץ, דרוש שיפוץ…" />
        </Field>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Field label="עיר" htmlFor="city">
          <input id="city" className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="שכונה" htmlFor="neighborhood">
          <input id="neighborhood" className={inputClass} value={form.neighborhood}
                 onChange={(e) => set('neighborhood', e.target.value)} />
        </Field>
        <Field label="רחוב" htmlFor="street">
          <input id="street" className={inputClass} value={form.street} onChange={(e) => set('street', e.target.value)} />
        </Field>
        <Field label="מספר בית" htmlFor="houseNumber">
          <input id="houseNumber" type="number" inputMode="numeric" className={inputClass}
                 value={form.houseNumber} onChange={(e) => set('houseNumber', e.target.value)} />
        </Field>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">מה יש בנכס</h2>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map((label) => {
            const on = amenities.includes(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleAmenity(label)}
                aria-pressed={on}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  on
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-900'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <Field label="תיאור" htmlFor="description">
          <textarea id="description" rows={5} className={inputClass} value={form.description}
                    onChange={(e) => set('description', e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="איש קשר" htmlFor="contactName">
            <input id="contactName" className={inputClass} value={form.contactName}
                   onChange={(e) => set('contactName', e.target.value)} />
          </Field>
          <Field label="מתווך" htmlFor="brokerName">
            <input id="brokerName" className={inputClass} value={form.brokerName}
                   onChange={(e) => set('brokerName', e.target.value)} />
          </Field>
        </div>
      </section>

      {/* Images need a listing id to hang off, so they appear once it has been saved. */}
      {listing && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <ImageManager listing={listing} onChange={setListing} />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? 'שומר…' : 'שמור'}
        </Button>

        {!published && (
          <Button variant="secondary" disabled={saving} onClick={() => void save('published')}>
            שמור ופרסם
          </Button>
        )}
        {published && (
          <Button variant="secondary" disabled={saving} onClick={() => void save('draft')}>
            הסר מפרסום
          </Button>
        )}

        <Button variant="ghost" onClick={() => navigate('/app/listings')}>
          חזרה
        </Button>

        {listing && listing.status !== 'archived' && (
          <Button variant="ghost" className="ms-auto text-red-700" onClick={() => setConfirmArchive(true)}>
            העבר לארכיון
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="להעביר את הנכס לארכיון?"
        description="הנכס ירד מהפרסום. הפניות והעסקאות המקושרות אליו יישמרו."
        confirmLabel="העבר לארכיון"
        onConfirm={() => void archive()}
      />
    </div>
  );
}
