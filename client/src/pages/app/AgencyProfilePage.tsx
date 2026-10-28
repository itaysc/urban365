import { useEffect, useRef, useState } from 'react';
import { Yad2ImportPanel } from '@/components/agency/Yad2ImportPanel';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import {
  fetchAgencyProfile,
  updateAgencyProfile,
  removeAgencyCover,
  uploadAgencyCover,
  type AgencyProfile,
} from '@/services/agency';

/** The agency's own public page: the banner and the description shown to visitors. */
export function AgencyProfilePage() {
  const [profile, setProfile] = useState<AgencyProfile | null>(null);
  const [form, setForm] = useState({ name: '', description: '', phone: '', contactEmail: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const apply = (p: AgencyProfile) => {
    setProfile(p);
    setForm({
      name: p.name ?? '',
      description: p.description ?? '',
      phone: p.phone ?? '',
      contactEmail: p.contactEmail ?? '',
    });
  };

  useEffect(() => {
    let cancelled = false;

    void fetchAgencyProfile()
      .then((p) => !cancelled && apply(p))
      .catch((e) => !cancelled && setError(errorMessageOf(e, 'לא הצלחנו לטעון את פרטי הסוכנות.')))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAgencyProfile(form);
      setProfile((p) => (p ? { ...p, ...updated } : p));
      setSaved(true);
    } catch (e) {
      setError(errorMessageOf(e, 'השמירה נכשלה.'));
    } finally {
      setSaving(false);
    }
  };

  const uploadCover = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const updated = await uploadAgencyCover(file);
      setProfile((p) => (p ? { ...p, ...updated } : p));
    } catch (e) {
      setError(errorMessageOf(e, 'העלאת התמונה נכשלה.'));
    } finally {
      setUploading(false);
      if (coverInput.current) coverInput.current.value = '';
    }
  };

  const clearCover = async () => {
    try {
      // Its own route rather than a field on the profile patch: the server also has to
      // remove the object, which a plain field update would leave behind.
      const { data } = await removeAgencyCover();
      setProfile((p) => (p ? { ...p, ...data } : p));
    } catch (e) {
      setError(errorMessageOf(e, 'לא הצלחנו להסיר את התמונה.'));
    }
  };

  if (loading) return <p className="text-sm text-slate-500">טוען…</p>;
  if (!profile) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error ?? 'לא נמצאו פרטי סוכנות.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">עמוד הסוכנות</h1>
        {saved && <span className="text-xs text-green-700">נשמר</span>}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Importing is an agency action on the agency's own page — it used to be the
          public home page, where anyone could point it at any yad2 id. */}
      <Yad2ImportPanel
        onImported={() => {
          void fetchAgencyProfile().then(apply).catch(() => undefined);
        }}
      />

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">תמונת נושא</h2>

        {profile.coverImageUrl ? (
          <img
            src={profile.coverImageUrl}
            alt=""
            className="aspect-[3/1] w-full rounded-lg object-cover"
          />
        ) : (
          <div className="flex aspect-[3/1] w-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
            אין תמונת נושא
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={coverInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            hidden
            onChange={(e) => e.target.files?.[0] && void uploadCover(e.target.files[0])}
          />
          <Button variant="secondary" disabled={uploading} onClick={() => coverInput.current?.click()}>
            {uploading ? 'מעלה…' : profile.coverImageUrl ? 'החלף תמונה' : 'העלה תמונה'}
          </Button>
          {profile.coverImageUrl && (
            <Button variant="ghost" onClick={() => void clearCover()}>
              הסר
            </Button>
          )}
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Field label="שם הסוכנות" htmlFor="agency-name">
          <input id="agency-name" className={inputClass} value={form.name}
                 onChange={(e) => set('name', e.target.value)} />
        </Field>

        <Field label="מספר רישיון" htmlFor="agency-license">
          {/* Read-only: this is the regulator's identifier, not a field to self-edit. */}
          <input id="agency-license" className={inputClass} value={profile.licenseNumber ?? '—'} disabled />
        </Field>

        <Field label="טלפון" htmlFor="agency-phone">
          <input id="agency-phone" className={inputClass} value={form.phone}
                 onChange={(e) => set('phone', e.target.value)} />
        </Field>

        <Field label="אימייל ליצירת קשר" htmlFor="agency-email">
          <input id="agency-email" type="email" className={inputClass} value={form.contactEmail}
                 onChange={(e) => set('contactEmail', e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="תיאור" htmlFor="agency-description">
            <textarea
              id="agency-description"
              rows={6}
              className={inputClass}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="ספרו על הסוכנות — באילו אזורים אתם פועלים, במה אתם מתמחים."
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? 'שומר…' : 'שמור'}
        </Button>
        <span className="text-xs text-slate-500">
          {profile._count.listings} נכסים · {profile._count.leads} פניות · {profile._count.deals} עסקאות
        </span>
      </div>
    </div>
  );
}
