import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-context';
import { TermsCheckbox } from '@/components/auth/TermsCheckbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AmenityPicker } from '@/components/listing/AmenityPicker';
import { CountPicker } from '@/components/listing/CountPicker';
import { NeighborhoodBox } from '@/components/listing/NeighborhoodBox';
import { RoomsPicker } from '@/components/search/RoomsPicker';
import { ImageUploader } from '@/components/seller/ImageUploader';
import { StagedImagePicker } from '@/components/seller/StagedImagePicker';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import {
  createMyListing,
  fetchMyListing,
  publishMyListing,
  updateMyListing,
  uploadMyListingImage,
  type SellerListingInput,
} from '@/services/seller';
import type { ListingImage } from '@/services/agency';

const SECTIONS = [
  { value: 'forsale', label: 'למכירה' },
  { value: 'rent', label: 'להשכרה' },
];

const PROPERTY_TYPES = ['דירה', 'דירת גן', 'פנטהאוז', 'בית פרטי/ קוטג׳', 'דופלקס', 'סטודיו', 'מגרש'];

/**
 * Roughly three hundred words. Long enough for everything true about a flat, short
 * enough that it stays a description rather than becoming a document — and the counter
 * appears near the end rather than nagging from the first letter.
 */
const DESCRIPTION_MAX = 2000;

const EMPTY: SellerListingInput = { section: 'forsale', city: '' };

/** `''` is "not stated", which is a null column — not a zero and not a NaN. */
const num = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** A floor is 0, 1, 2 — never 2.5. Typed decimals are cut rather than refused. */
const whole = (value: string): number | undefined => {
  const parsed = num(value);
  return parsed === undefined ? undefined : Math.max(0, Math.trunc(parsed));
};

/** Which fields hold text; everything else is a number. */
const TEXT_FIELDS = new Set<keyof SellerListingInput>([
  'section',
  'city',
  'street',
  'neighborhood',
  'propertyType',
  'description',
  'contactName',
]);

/**
 * Publishing your own property, without an agency.
 *
 * Everything is chosen before anything is sent: a flat that went on the market while
 * its photos were still uploading was on the market with no photos, which is the one
 * state in which nobody opens it. So one submit creates the listing as a draft, sends
 * the pictures together, and publishes only once they have all landed.
 *
 * Editing an existing listing is the other shape — it is already live, so a photo added
 * there uploads on the spot.
 */
export function PublishPage() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [form, setForm] = useState<SellerListingInput>(EMPTY);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [staged, setStaged] = useState<File[]>([]);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [step, setStep] = useState<string | null>(null);

  const editing = Boolean(listingId);

  /**
   * Set the moment the listing is safely up, so the navigation that follows is not
   * mistaken for someone abandoning the form. A ref rather than state because the
   * guard reads it during a navigation that is already under way.
   */
  const leaving = useRef(false);

  // Anything typed, chosen or dropped in. `section` is excluded — it has a default and
  // is set before anybody touches the page, so counting it would mean warning about an
  // empty form.
  const started = () =>
    staged.length > 0 ||
    amenities.length > 0 ||
    acceptedTerms ||
    Object.entries(form).some(([key, value]) => key !== 'section' && value !== undefined && value !== '');

  const blocker = useLeaveGuard(() => !editing && !leaving.current && started());

  useQuery({
    queryKey: qk.mySale.detail(listingId ?? ''),
    queryFn: async () => {
      const listing = await fetchMyListing(listingId!);
      setForm({
        section: listing.section,
        city: listing.city ?? '',
        street: listing.street ?? undefined,
        houseNumber: listing.houseNumber ?? undefined,
        neighborhood: listing.neighborhood ?? undefined,
        price: listing.price ?? undefined,
        rooms: listing.rooms ?? undefined,
        squareMeter: listing.squareMeter ?? undefined,
        floor: listing.floor ?? undefined,
        buildingTopFloor: listing.buildingTopFloor ?? undefined,
        parkingSpacesCount: listing.parkingSpacesCount ?? undefined,
        propertyType: listing.propertyType ?? undefined,
        description: listing.description ?? undefined,
        contactName: listing.contactName ?? undefined,
      });
      setAmenities(listing.amenities);
      setImages(listing.images);
      return listing;
    },
    enabled: editing,
  });

  const save = useMutation({
    mutationFn: async (input: SellerListingInput) => {
      if (listingId) return updateMyListing(listingId, input);

      setStep('שומר את פרטי הנכס…');
      const listing = await createMyListing({ ...input, acceptedTerms });

      if (staged.length > 0) {
        setStep(`מעלה ${staged.length} תמונות…`);
        // Together, not one after another — and each one carrying the slot it belongs
        // in, since they finish in whatever order the network decides.
        await Promise.all(
          staged.map((file, position) => uploadMyListingImage(listing.id, file, position)),
        );
      }

      // Last, so the listing never appears in search without its photos.
      setStep('מפרסם…');
      await publishMyListing(listing.id);
      return listing;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.mySale.all });
      setStep(null);
      if (listingId) {
        toast.success('הנכס עודכן.');
      } else {
        toast.success('הנכס פורסם.');
        // Nothing is being abandoned: it is published. Set before navigating, or the
        // guard stops the very navigation that success is supposed to cause.
        leaving.current = true;
        navigate('/sell');
      }
    },
    onError: (e) => {
      setStep(null);
      toast.error(
        errorMessageOf(
          e,
          // The listing may well exist as a draft by now, which is why this points at
          // the list rather than suggesting everything was lost.
          'לא הצלחנו לפרסם את הנכס. אפשר לנסות שוב מתוך "הנכסים שלי".',
        ),
      );
    },
  });

  const set = (key: keyof SellerListingInput, value: string) =>
    setForm((f) => ({
      ...f,
      [key]: TEXT_FIELDS.has(key)
        ? value
        : key === 'floor' || key === 'buildingTopFloor'
          ? whole(value)
          : num(value),
    }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({ ...form, city: form.city.trim(), amenities });
  };

  const description = form.description ?? '';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {editing ? 'עריכת הנכס' : 'פרסום נכס'}
            </h1>
            <p className="text-sm text-slate-500">
              {editing
                ? 'הנכס מפורסם. שינויים נשמרים מיד.'
                : 'מפרסמים ישירות, בלי סוכנות. הנכס יעלה לאוויר עם התמונות יחד.'}
            </p>
          </div>

          <Link to="/sell" className="text-sm text-blue-700 hover:underline">
            ← הנכסים שלי
          </Link>
        </header>

        {/*
          Without a number on the account nobody can ring. Said here rather than after
          publishing, when it is too late to be useful.
        */}
        {!user?.phone && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            לא הוספתם מספר טלפון לחשבון, ולכן לא תהיה דרך ליצור איתכם קשר טלפוני.{' '}
            <Link to="/app/profile" className="font-medium underline">
              הוספת טלפון
            </Link>
          </p>
        )}

        <form onSubmit={submit} className="flex flex-col gap-6">
          <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="סוג עסקה" htmlFor="section" required>
                <select id="section" className={selectClass} value={form.section}
                        onChange={(e) => set('section', e.target.value)}>
                  {SECTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>

              <Field label="סוג נכס" htmlFor="propertyType">
                <select id="propertyType" className={selectClass} value={form.propertyType ?? ''}
                        onChange={(e) => set('propertyType', e.target.value)}>
                  <option value="">בחרו…</option>
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>

              <Field label="עיר" htmlFor="city" required>
                <input id="city" required className={inputClass} value={form.city}
                       onChange={(e) => set('city', e.target.value)} />
              </Field>

              {/*
                Suggested from the neighbourhoods we hold in that city, and scoped to it
                — several towns have a מרכז העיר. Free text still stands: a new
                development has a name before it has any listings.
              */}
              <Field label="שכונה" htmlFor="neighborhood">
                <NeighborhoodBox
                  city={form.city}
                  value={form.neighborhood ?? ''}
                  onChange={(value) => set('neighborhood', value)}
                />
              </Field>

              <Field label="רחוב" htmlFor="street">
                <input id="street" className={inputClass} value={form.street ?? ''}
                       onChange={(e) => set('street', e.target.value)} />
              </Field>

              <Field label="מספר בית" htmlFor="houseNumber">
                <input id="houseNumber" type="number" min={0} className={inputClass}
                       value={form.houseNumber ?? ''}
                       onChange={(e) => set('houseNumber', e.target.value)} />
              </Field>
            </div>
          </section>

          {/*
            The same control the search page uses, so a number of rooms is chosen the
            same way whichever side of the site you are on — but one value, because a
            flat has a number and only a search has a range.
          */}
          <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-4">
            <RoomsPicker
              single
              min={form.rooms}
              max={form.rooms}
              onChange={(next) => setForm((f) => ({ ...f, rooms: next.min }))}
            />

            {/* Nothing chosen is not zero: "no parking" is a claim a buyer filters on,
                and not saying is not the same as saying none. */}
            <CountPicker
              legend="חניות"
              value={form.parkingSpacesCount}
              onChange={(value) => setForm((f) => ({ ...f, parkingSpacesCount: value }))}
              hint="בלי חניה? בחרו 0. אפשר גם להשאיר ריק."
            />
          </section>

          <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <Field label="מחיר (₪)" htmlFor="price">
              <input id="price" type="number" min={0} step={10000} className={inputClass}
                     value={form.price ?? ''} onChange={(e) => set('price', e.target.value)} />
            </Field>
            <Field label="שטח (מ״ר)" htmlFor="squareMeter">
              <input id="squareMeter" type="number" min={0} className={inputClass}
                     value={form.squareMeter ?? ''} onChange={(e) => set('squareMeter', e.target.value)} />
            </Field>
            <Field label="איש קשר" htmlFor="contactName">
              <input id="contactName" className={inputClass} value={form.contactName ?? ''}
                     onChange={(e) => set('contactName', e.target.value)}
                     placeholder={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()} />
            </Field>
            {/* Whole floors only, ground included. `step` makes the spinner behave and
                `whole` catches anything typed or pasted past it. */}
            <Field label="קומה" htmlFor="floor">
              <input id="floor" type="number" min={0} step={1} inputMode="numeric" className={inputClass}
                     value={form.floor ?? ''} onChange={(e) => set('floor', e.target.value)} />
            </Field>
            <Field label="מתוך קומות" htmlFor="buildingTopFloor">
              <input id="buildingTopFloor" type="number" min={0} step={1} inputMode="numeric"
                     className={inputClass} value={form.buildingTopFloor ?? ''}
                     onChange={(e) => set('buildingTopFloor', e.target.value)} />
            </Field>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">מה יש בנכס</h2>
            <AmenityPicker
              selected={amenities}
              onToggle={(value) =>
                setAmenities((a) =>
                  a.includes(value) ? a.filter((x) => x !== value) : [...a, value],
                )
              }
            />
          </section>

          <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
            <Field label="תיאור" htmlFor="description">
              <textarea id="description" rows={5} className={inputClass}
                        maxLength={DESCRIPTION_MAX}
                        value={description}
                        onChange={(e) => set('description', e.target.value)}
                        placeholder="ספרו על הנכס — מה מיוחד בו, מה בסביבה, מתי אפשר להיכנס." />
            </Field>
            {/* Quiet until it is nearly spent: a counter from the first letter reads as
                a limit on what you are allowed to say. */}
            {description.length > DESCRIPTION_MAX * 0.8 && (
              <p dir="ltr" className="self-start text-xs text-slate-400">
                {description.length} / {DESCRIPTION_MAX}
              </p>
            )}
          </section>

          {/*
            Chosen now, uploaded on submit. While editing there is a listing to upload
            to already, so photos there go up as they are picked.
          */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            {editing ? (
              <ImageUploader listingId={listingId!} images={images} onChange={setImages} />
            ) : (
              <StagedImagePicker files={staged} onChange={setStaged} disabled={save.isPending} />
            )}
          </section>

          {/*
            Asked here rather than only at signup: publishing a property is the act the
            terms are about, and it is the last moment before it is public. Not shown
            while editing — the agreement was given when this listing went up, and
            asking again on every saved typo would train people to tick without reading.
          */}
          {!editing && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <TermsCheckbox
                id="publish-terms"
                checked={acceptedTerms}
                onChange={setAcceptedTerms}
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={save.isPending || form.city.trim() === '' || (!editing && !acceptedTerms)}
            >
              {save.isPending
                ? (step ?? 'שומר…')
                : editing
                  ? 'שמירת שינויים'
                  : 'פרסום הנכס'}
            </Button>

            {editing && (
              <button type="button" onClick={() => navigate('/sell')}
                      className="text-sm text-slate-500 hover:text-slate-900">
                סיום
              </button>
            )}
          </div>
        </form>
      </div>

      {/*
        Radix rather than the browser's own confirm, which is unstyled, untranslated and
        laid out left to right — and which cannot say what is actually at stake here:
        photos that have not been uploaded anywhere yet.
      */}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title="לצאת בלי לפרסם?"
        description={
          staged.length > 0
            ? `הפרטים שמילאתם ו-${staged.length} התמונות שבחרתם יימחקו. הנכס עדיין לא פורסם.`
            : 'הפרטים שמילאתם יימחקו. הנכס עדיין לא פורסם.'
        }
        confirmLabel="יציאה ומחיקה"
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}
