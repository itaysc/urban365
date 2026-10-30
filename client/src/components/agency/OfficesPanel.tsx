import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CityBox } from '@/components/listing/CityBox';
import { StreetBox } from '@/components/listing/StreetBox';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import {
  createOffice,
  deleteOffice,
  fetchOffices,
  updateOffice,
  type AgencyOffice,
  type OfficeInput,
} from '@/services/agency';

const EMPTY: OfficeInput = { label: '', city: '', street: '', phone: '' };

/**
 * The agency's branches, and where they appear on the public map.
 *
 * An address is turned into coordinates when it is saved, which can fail — a street the
 * geocoder does not know, a typo. The office is kept either way and the row says so,
 * because an office that exists but cannot be placed is a different problem from one
 * that was not saved, and only one of them is fixed by editing the address.
 */
export function OfficesPanel() {
  const { user } = useAuth();

  // A branch is on the public page and on the map: changing one moves where the public
  // is told to turn up, so it is the agency's detail and not an agent's. The server
  // refuses either way; this keeps the form from being offered.
  const canManage = user?.agency?.role === 'owner' || user?.platformRole === 'admin';

  const queryClient = useQueryClient();
  const [form, setForm] = useState<OfficeInput>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);

  const { data: offices, isPending } = useQuery({
    queryKey: qk.offices.list,
    queryFn: fetchOffices,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.offices.all });

  const save = useMutation({
    mutationFn: (input: OfficeInput) =>
      editing ? updateOffice(editing, input) : createOffice(input),
    onSuccess: (office) => {
      void invalidate();
      setForm(EMPTY);
      setEditing(null);
      toast.success(
        office.latitude === null
          ? 'הסניף נשמר, אבל לא הצלחנו לאתר את הכתובת על המפה.'
          : 'הסניף נשמר.',
      );
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לשמור את הסניף.')),
  });

  const remove = useMutation({
    mutationFn: deleteOffice,
    onSuccess: () => {
      void invalidate();
      toast.success('הסניף הוסר.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו להסיר את הסניף.')),
  });

  const edit = (office: AgencyOffice) => {
    setEditing(office.id);
    setForm({
      label: office.label ?? '',
      city: office.city,
      street: office.street ?? '',
      houseNumber: office.houseNumber ?? undefined,
      phone: office.phone ?? '',
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      // Blank boxes mean "not stated", which is a null column rather than an empty
      // string the map would later try to render.
      label: form.label?.trim() || undefined,
      city: form.city.trim(),
      street: form.street?.trim() || undefined,
      houseNumber: form.houseNumber,
      phone: form.phone?.trim() || undefined,
    });
  };

  const set = (key: keyof OfficeInput, value: string) =>
    setForm((f) => ({
      ...f,
      [key]: key === 'houseNumber' ? (value === '' ? undefined : Number(value)) : value,
    }));

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">סניפים</h2>
        <p className="mt-1 text-xs text-slate-500">
          הכתובות שלכם מוצגות על המפה בחיפוש, לצד הנכסים שלכם.
        </p>
      </div>

      {isPending && <p className="text-sm text-slate-500">טוען…</p>}

      {offices && offices.length > 0 && (
        <ul className="flex flex-col gap-2">
          {offices.map((office) => (
            <li
              key={office.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {office.label || 'סניף'}
                </p>
                <p className="truncate text-sm text-slate-600">
                  {[
                    [office.street, office.houseNumber].filter(Boolean).join(' '),
                    office.city,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {office.phone && <p className="text-xs text-slate-500" dir="ltr">{office.phone}</p>}

                {office.latitude === null && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    לא אותר על המפה — בדקו את הכתובת
                  </p>
                )}
              </div>

              <div className={`flex shrink-0 items-center gap-1 ${canManage ? '' : 'hidden'}`}>
                <button
                  type="button"
                  onClick={() => edit(office)}
                  className="rounded-lg px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100"
                >
                  עריכה
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(office.id)}
                  disabled={remove.isPending}
                  aria-label="הסרת הסניף"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!canManage && (
        <p className="border-t border-slate-100 pt-4 text-sm text-slate-500">
          רק בעלים של הסוכנות יכול להוסיף או לערוך סניפים.
        </p>
      )}

      <form
        onSubmit={submit}
        className={`flex flex-col gap-3 border-t border-slate-100 pt-4 ${canManage ? '' : 'hidden'}`}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="שם הסניף" htmlFor="office-label">
            <input id="office-label" className={inputClass} value={form.label ?? ''}
                   onChange={(e) => set('label', e.target.value)} placeholder="הסניף הראשי" />
          </Field>

          {/* Also from the list: this address is geocoded to put a pin on the map, and
              a misspelt city is a branch that lands in the wrong place or nowhere. */}
          <Field label="עיר" htmlFor="office-city" required>
            <CityBox
              id="office-city"
              required
              value={form.city}
              onChange={(value) => set('city', value)}
            />
          </Field>

          <Field label="רחוב" htmlFor="office-street">
            <StreetBox
              id="office-street"
              city={form.city}
              value={form.street ?? ''}
              onChange={(value) => set('street', value)}
            />
          </Field>

          <Field label="מספר" htmlFor="office-number">
            <input id="office-number" type="number" min={0} className={inputClass}
                   value={form.houseNumber ?? ''}
                   onChange={(e) => set('houseNumber', e.target.value)} />
          </Field>

          <Field label="טלפון" htmlFor="office-phone">
            <input id="office-phone" type="tel" dir="ltr" className={inputClass}
                   value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={save.isPending || form.city.trim() === ''}>
            {save.isPending ? 'שומר…' : editing ? 'שמירת הסניף' : <><Plus className="h-4 w-4" /> הוספת סניף</>}
          </Button>

          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
              }}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              ביטול
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
