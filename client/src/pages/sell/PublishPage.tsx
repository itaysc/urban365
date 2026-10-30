import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-context';
import { AmenityPicker } from '@/components/listing/AmenityPicker';
import { ImageUploader } from '@/components/seller/ImageUploader';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import {
  createMyListing,
  fetchMyListing,
  updateMyListing,
  type SellerListingInput,
} from '@/services/seller';
import type { ListingImage } from '@/services/agency';

const SECTIONS = [
  { value: 'forsale', label: 'למכירה' },
  { value: 'rent', label: 'להשכרה' },
];

const PROPERTY_TYPES = ['דירה', 'דירת גן', 'פנטהאוז', 'בית פרטי/ קוטג׳', 'דופלקס', 'סטודיו', 'מגרש'];

const EMPTY: SellerListingInput = { section: 'forsale', city: '' };

/** `''` is "not stated", which is a null column — not a zero and not a NaN. */
const num = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Publishing your own property, without an agency.
 *
 * The listing is created before any photo is uploaded, because a photo needs something
 * to belong to — so the page is in two acts: the details, then the pictures. That is
 * also why it publishes immediately and is edited afterwards rather than being
 * assembled in private and released at the end.
 */
export function PublishPage() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [form, setForm] = useState<SellerListingInput>(EMPTY);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const editingId = listingId ?? createdId;

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
        propertyType: listing.propertyType ?? undefined,
        description: listing.description ?? undefined,
        contactName: listing.contactName ?? undefined,
      });
      setAmenities(listing.amenities);
      setImages(listing.images);
      return listing;
    },
    enabled: Boolean(listingId),
  });

  const save = useMutation({
    mutationFn: (input: SellerListingInput) =>
      editingId ? updateMyListing(editingId, input) : createMyListing(input),
    onSuccess: (listing) => {
      setCreatedId(listing.id);
      void queryClient.invalidateQueries({ queryKey: qk.mySale.all });
      toast.success(editingId ? 'הנכס עודכן.' : 'הנכס פורסם. אפשר להוסיף תמונות.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לשמור את הנכס.')),
  });

  const set = (key: keyof SellerListingInput, value: string) =>
    setForm((f) => ({
      ...f,
      [key]:
        key === 'section' || key === 'city' || key === 'street' || key === 'neighborhood' ||
        key === 'propertyType' || key === 'description' || key === 'contactName'
          ? value
          : num(value),
    }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({ ...form, city: form.city.trim(), amenities });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {listingId ? 'עריכת הנכס' : 'פרסום נכס'}
            </h1>
            <p className="text-sm text-slate-500">
              {editingId ? 'הנכס מפורסם. שינויים נשמרים מיד.' : 'מפרסמים ישירות, בלי סוכנות.'}
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

              <Field label="שכונה" htmlFor="neighborhood">
                <input id="neighborhood" className={inputClass} value={form.neighborhood ?? ''}
                       onChange={(e) => set('neighborhood', e.target.value)} />
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

          <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <Field label="מחיר (₪)" htmlFor="price">
              <input id="price" type="number" min={0} step={10000} className={inputClass}
                     value={form.price ?? ''} onChange={(e) => set('price', e.target.value)} />
            </Field>
            <Field label="חדרים" htmlFor="rooms">
              <input id="rooms" type="number" min={0} step={0.5} className={inputClass}
                     value={form.rooms ?? ''} onChange={(e) => set('rooms', e.target.value)} />
            </Field>
            <Field label="שטח (מ״ר)" htmlFor="squareMeter">
              <input id="squareMeter" type="number" min={0} className={inputClass}
                     value={form.squareMeter ?? ''} onChange={(e) => set('squareMeter', e.target.value)} />
            </Field>
            <Field label="קומה" htmlFor="floor">
              <input id="floor" type="number" className={inputClass}
                     value={form.floor ?? ''} onChange={(e) => set('floor', e.target.value)} />
            </Field>
            <Field label="מתוך קומות" htmlFor="buildingTopFloor">
              <input id="buildingTopFloor" type="number" min={0} className={inputClass}
                     value={form.buildingTopFloor ?? ''}
                     onChange={(e) => set('buildingTopFloor', e.target.value)} />
            </Field>
            <Field label="איש קשר" htmlFor="contactName">
              <input id="contactName" className={inputClass} value={form.contactName ?? ''}
                     onChange={(e) => set('contactName', e.target.value)}
                     placeholder={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()} />
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
                        value={form.description ?? ''}
                        onChange={(e) => set('description', e.target.value)}
                        placeholder="ספרו על הנכס — מה מיוחד בו, מה בסביבה, מתי אפשר להיכנס." />
            </Field>
          </section>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending || form.city.trim() === ''}>
              {save.isPending ? 'שומר…' : editingId ? 'שמירת שינויים' : 'פרסום הנכס'}
            </Button>

            {editingId && (
              <button type="button" onClick={() => navigate('/sell')}
                      className="text-sm text-slate-500 hover:text-slate-900">
                סיום
              </button>
            )}
          </div>
        </form>

        {/*
          Only once the listing exists. A photo needs something to belong to, and the
          alternative — holding files in the browser and uploading them on submit —
          loses every one of them if the submit fails.
        */}
        {editingId ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <ImageUploader listingId={editingId} images={images} onChange={setImages} />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            אחרי הפרסום תוכלו להוסיף עד 10 תמונות.
          </p>
        )}
      </div>
    </div>
  );
}
