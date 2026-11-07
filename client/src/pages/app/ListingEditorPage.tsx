import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ImageManager } from '@/components/listing/ImageManager';
import { Button } from '@/components/ui/Button';
import { ViewingHistory } from '@/components/agency/ViewingHistory';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CityBox } from '@/components/listing/CityBox';
import { NeighborhoodBox } from '@/components/listing/NeighborhoodBox';
import { StreetBox } from '@/components/listing/StreetBox';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { AmenityPicker } from '@/components/listing/AmenityPicker';
import { useToast } from '@/components/ui/Toast';
import { errorCodeOf, errorMessageOf, statusOf } from '@/lib/apiError';
import { EXCLUSIVE_LABEL } from '@/lib/exclusivity';
import { fetchCustomers } from '@/services/crm';
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
 * Parking is absent on purpose: it is a count field above, not a yes/no, and so is
 * exclusivity: it describes the agency's mandate rather than the property, and has its
 * own toggle below.
 */

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
  sellerCustomerId: '',
};

/**
 * Fields where an empty box is an answer rather than a blank.
 *
 * Everywhere else "" means "not stated" and is left out of the request, so a PATCH
 * about the price does not wipe the description. Unlinking the owner of a property is
 * a thing somebody means to do, and the only way to say it is to send the empty value.
 */
const ALWAYS_SENT = new Set(['sellerCustomerId']);

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
  // Annotated: spreading a Record<string, string> into a literal leaves TypeScript with
  // only the explicit key, so the inferred type was `{ section: string }` and the
  // assignment below had nothing to index into.
  const form: Form = { ...EMPTY, section: listing.section };
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
function toInput(
  form: Form,
  amenities: string[],
  isExclusive: boolean,
  isNewFromDeveloper: boolean,
): ListingInput {
  const input: Record<string, unknown> = {
    section: form.section,
    amenities,
    isExclusive,
    isNewFromDeveloper,
  };

  for (const [key, raw] of Object.entries(form)) {
    if (key === 'section') continue;
    const value = raw.trim();
    // An empty box means "not stated", which is a null column — not a zero, and not a
    // NaN from Number('').
    if (value === '' && !ALWAYS_SENT.has(key)) continue;
    input[key] = NUMERIC.has(key) ? Number(value) : value;
  }

  return input as unknown as ListingInput;
}

export function ListingEditorPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isNew = !listingId || listingId === 'new';

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [isExclusive, setIsExclusive] = useState(false);
  const [isNewFromDeveloper, setIsNewFromDeveloper] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  /** Held while the duplicate prompt is open, so "add anyway" can retry the same save. */
  const [duplicate, setDuplicate] = useState<{ message: string; status?: 'draft' | 'published' } | null>(null);

  const { data: fetched, isPending, isError, error: fetchError } = useQuery({
    queryKey: qk.listings.detail(listingId ?? ''),
    queryFn: () => fetchListing(listingId!),
    enabled: !isNew,
  });

  /**
   * The agency's customers, for the "whose property is this" picker.
   *
   * One page of a hundred rather than a search box: an agency has tens of customers,
   * not thousands, and the one case where that is not true says so under the field
   * instead of quietly offering a truncated list as if it were all of them.
   */
  const { data: customers } = useQuery({
    queryKey: qk.customers.picker,
    queryFn: () => fetchCustomers({ pageSize: 100 }),
  });

  /**
   * The form is still local state, deliberately: it is a draft the user is editing, not
   * server data, and overwriting it from the cache mid-edit would discard their typing.
   * It is seeded from the query once, and again whenever the server returns a new
   * version after a save.
   */
  useEffect(() => {
    if (!fetched) return;
    setListing(fetched);
    setForm(toForm(fetched));
    setAmenities(fetched.amenities ?? []);
    setIsExclusive(fetched.isExclusive);
    setIsNewFromDeveloper(fetched.isNewFromDeveloper);
  }, [fetched]);

  // Derived, not mirrored into state: a second copy of something Query already tracks
  // is one more thing that can disagree with it.
  const loading = !isNew && isPending;

  useEffect(() => {
    if (!isError) return;

    // Only a 404 means the property is not there. Everything else said so too, which
    // sent people looking for a listing that was fine while the real answer was that
    // their session had expired or the server was not answering.
    const status = statusOf(fetchError);
    setError(
      status === 404
        ? 'הנכס לא נמצא.'
        : status === 401 || status === 403
          ? 'אין גישה לנכס הזה. ייתכן שההתחברות פגה — נסו להתחבר שוב.'
          : errorMessageOf(fetchError, 'לא הצלחנו לטעון את הנכס. בדקו את החיבור ונסו שוב.'),
    );
  }, [isError, fetchError]);

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

  const save = async (status?: 'draft' | 'published', allowDuplicate = false) => {
    setSaving(true);
    setError(null);
    setOutOfCredits(false);

    try {
      const input = {
        ...toInput(form, amenities, isExclusive, isNewFromDeveloper),
        ...(status ? { status } : {}),
        ...(allowDuplicate ? { allowDuplicate: true } : {}),
      };

      if (isNew) {
        const created = await createListing(input);
        // Invalidation sits with the write. Every list of this agency's listings is now
        // wrong, and `qk.listings.all` is the prefix all of them share.
        await queryClient.invalidateQueries({ queryKey: qk.listings.all });
        toast.success(status === 'published' ? 'הנכס נוצר ופורסם.' : 'הנכס נוצר.');
        // replace, not push: Back from a saved listing should reach the list, not the
        // empty form that no longer applies.
        navigate(`/app/listings/${created.id}`, { replace: true });
        return;
      }

      const updated = await updateListing(listingId, input);
      // The response is the new truth, so it goes into the cache rather than prompting
      // a refetch of the row we are holding; the lists still need re-reading.
      queryClient.setQueryData(qk.listings.detail(listingId), updated);
      await queryClient.invalidateQueries({ queryKey: qk.listings.all });
      setListing(updated);
      setForm(toForm(updated));
      setSaved(true);
      toast.success(
        status === 'published' ? 'הנכס פורסם.' : status === 'draft' ? 'הנכס הוסר מפרסום.' : 'הנכס נשמר.',
      );
    } catch (e) {
      const message = errorMessageOf(e, 'השמירה נכשלה.');

      // Not an error so much as a question: the match is on address and size, which two
      // genuinely different units can share, so the agency decides.
      if (errorCodeOf(e) === 'duplicate_listing') {
        setDuplicate({ message, status });
        return;
      }

      setError(message);
      setOutOfCredits(errorCodeOf(e) === 'listing_credits');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    setConfirmArchive(false);
    try {
      await archiveListing(listingId!);
      await queryClient.invalidateQueries({ queryKey: qk.listings.all });
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
              {published ? 'פורסם' : listing.status === 'draft' ? 'טיוטה' : 'בארכיון'}
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}{' '}
          {outOfCredits && (
            <Link to="/app/listings" className="font-medium underline">
              לקניית חבילה
            </Link>
          )}
        </p>
      )}

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Field label="סוג עסקה" htmlFor="section" required>
          <select
            id="section"
            className={selectClass}
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
        {/*
          The same two boxes the private seller's form uses. `Listing.city` is compared
          exactly, so an agent's typo is a listing nobody searching that city will find —
          and an agency typing a hundred of them is where that happens.
        */}
        <Field label="עיר" htmlFor="city">
          <CityBox value={form.city} onChange={(value) => set('city', value)} />
        </Field>
        <Field label="שכונה" htmlFor="neighborhood">
          <NeighborhoodBox
            city={form.city}
            value={form.neighborhood}
            onChange={(value) => set('neighborhood', value)}
          />
        </Field>
        <Field label="רחוב" htmlFor="street">
          <StreetBox
            city={form.city}
            value={form.street}
            onChange={(value) => set('street', value)}
          />
        </Field>
        <Field label="מספר בית" htmlFor="houseNumber">
          <input id="houseNumber" type="number" inputMode="numeric" className={inputClass}
                 value={form.houseNumber} onChange={(e) => set('houseNumber', e.target.value)} />
        </Field>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">מה יש בנכס</h2>
        <AmenityPicker selected={amenities} onToggle={toggleAmenity} />
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">{EXCLUSIVE_LABEL}</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isExclusive}
            onChange={(e) => {
              setIsExclusive(e.target.checked);
              setSaved(false);
            }}
            className="h-4 w-4 flex-none"
          />
          הנכס משווק בבלעדיות על ידי הסוכנות
        </label>
        <p className="text-xs text-slate-500">מוצג כתווית על הנכס בתוצאות החיפוש ובעמוד הנכס.</p>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">דירה חדשה</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isNewFromDeveloper}
            onChange={(e) => {
              setIsNewFromDeveloper(e.target.checked);
              setSaved(false);
            }}
            className="h-4 w-4 flex-none"
          />
          הנכס נמכר על ידי הקבלן ולא על ידי בעלים קודם
        </label>
        <p className="text-xs text-slate-500">
          מאפשר למחפשים לסנן דירות חדשות בלבד, ומוצג כתווית על הנכס.
        </p>
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

        {/*
          Not the same thing as "איש קשר" above, which is a name on an ad. This is the
          person the viewings have to be put to, and it is what makes coordinating one
          possible at all.
        */}
        <Field label="בעל הנכס" htmlFor="sellerCustomerId">
          <select
            id="sellerCustomerId"
            className={selectClass}
            value={form.sellerCustomerId}
            onChange={(e) => set('sellerCustomerId', e.target.value)}
          >
            <option value="">לא צוין</option>
            {customers?.items.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.phone ? ` · ${customer.phone}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-slate-500">
          {customers && customers.total > customers.items.length
            ? `מוצגים ${customers.items.length} הלקוחות האחרונים מתוך ${customers.total}.`
            : 'מי שצריך לאשר ביקור בנכס. בוחרים מתוך הלקוחות של הסוכנות.'}
        </p>
      </section>

      {/* Images need a listing id to hang off, so they appear once it has been saved. */}
      {listing && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <ImageManager listing={listing} onChange={setListing} />
        </section>
      )}

      {/* Same reason: a property nobody has saved yet has nobody who has seen it. */}
      {listing && <ViewingHistory listingId={listing.id} />}

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
        open={duplicate !== null}
        onOpenChange={(open) => !open && setDuplicate(null)}
        title="נכס דומה כבר קיים"
        description={`${duplicate?.message ?? ''} אפשר להוסיף אותו בכל זאת אם מדובר ביחידה אחרת.`}
        confirmLabel="הוסף בכל זאת"
        busy={saving}
        onConfirm={() => {
          const pending = duplicate;
          setDuplicate(null);
          void save(pending?.status, true);
        }}
      />

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
