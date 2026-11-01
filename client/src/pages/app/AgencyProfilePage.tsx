import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { useAuth } from '@/auth/auth-context';
import { Yad2ImportPanel } from '@/components/agency/Yad2ImportPanel';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import {
  fetchAgencyProfile,
  updateAgencyProfile,
  removeAgencyCover,
  uploadAgencyCover,
  type AgencyProfile,
} from '@/services/agency';
import { OfficesPanel } from '@/components/agency/OfficesPanel';
import { PhoneField } from '@/components/ui/PhoneField';
import { DemoDataPanel } from '@/components/agency/DemoDataPanel';

/** The agency's own public page: the banner and the description shown to visitors. */
export function AgencyProfilePage() {
  const toast = useToast();
  const { user, refresh } = useAuth();

  // Only an owner may change the agency's own details — the name, the contact details
  // and the branches are what the public sees and what a buyer rings. The server
  // refuses an agent either way; this is so they are not shown a form that will.
  const canManage = user?.agency?.role === 'owner' || user?.platformRole === 'admin';
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<AgencyProfile | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    phone: '',
    contactEmail: '',
    coBrokerage: true,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (p: AgencyProfile) => {
    setProfile(p);
    setForm({
      name: p.name ?? '',
      description: p.description ?? '',
      phone: p.phone ?? '',
      contactEmail: p.contactEmail ?? '',
      coBrokerage: p.coBrokerage,
    });
  };

  const { data: fetched, isPending: loading, isError } = useQuery({
    queryKey: qk.agency.profile,
    queryFn: fetchAgencyProfile,
  });

  // The form is a draft the user is editing, so it is seeded from the query rather than
  // bound to it — re-reading mid-edit would discard their typing.
  useEffect(() => {
    if (fetched) apply(fetched);
  }, [fetched]);

  useEffect(() => {
    if (isError) setError('לא הצלחנו לטעון את פרטי הסוכנות.');
  }, [isError]);

  const set = (key: keyof typeof form, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAgencyProfile(form);
      setProfile((p) => (p ? { ...p, ...updated } : p));
      await queryClient.invalidateQueries({ queryKey: qk.agency.all });
      // The agency name is shown from the auth context — the nav bar, the pending page,
      // the team screen — and that is a separate copy of the record. Without re-reading
      // it, renaming the agency here left the old name everywhere else until a reload.
      await refresh();
      setSaved(true);
      toast.success('פרטי הסוכנות נשמרו.');
    } catch (e) {
      const message = errorMessageOf(e, 'השמירה נכשלה.');
      setError(message);
      toast.error(message);
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
      await queryClient.invalidateQueries({ queryKey: qk.agency.all });
      toast.success('תמונת הנושא עודכנה.');
    } catch (e) {
      const message = errorMessageOf(e, 'העלאת התמונה נכשלה.');
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const clearCover = async () => {
    try {
      // Its own route rather than a field on the profile patch: the server also has to
      // remove the object, which a plain field update would leave behind.
      const { data } = await removeAgencyCover();
      setProfile((p) => (p ? { ...p, ...data } : p));
      await queryClient.invalidateQueries({ queryKey: qk.agency.all });
      toast.success('תמונת הנושא הוסרה.');
    } catch (e) {
      const message = errorMessageOf(e, 'לא הצלחנו להסיר את התמונה.');
      setError(message);
      toast.error(message);
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
          void queryClient.invalidateQueries({ queryKey: qk.agency.all });
          void queryClient.invalidateQueries({ queryKey: qk.listings.all });
        }}
      />

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">תמונת נושא</h2>

        {profile.coverImageUrl && (
          <img
            src={profile.coverImageUrl}
            alt=""
            className="aspect-[3/1] w-full rounded-lg object-cover"
          />
        )}

        <Dropzone disabled={uploading || !canManage} onFiles={(files) => void uploadCover(files[0])}>
          {uploading
            ? 'מעלה…'
            : profile.coverImageUrl
              ? 'גררו תמונה להחלפה או לחצו לבחירה'
              : 'גררו תמונת נושא לכאן או לחצו לבחירה'}
        </Dropzone>

        {profile.coverImageUrl && canManage && (
          <div>
            <Button variant="ghost" onClick={() => void clearCover()}>
              הסר תמונה
            </Button>
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Field label="שם הסוכנות" htmlFor="agency-name">
          <input id="agency-name" disabled={!canManage} className={inputClass} value={form.name}
                 onChange={(e) => set('name', e.target.value)} />
        </Field>

        <Field label="מספר רישיון" htmlFor="agency-license">
          {/* Read-only: this is the regulator's identifier, not a field to self-edit. */}
          <input id="agency-license" className={inputClass} value={profile.licenseNumber ?? '—'} disabled />
        </Field>

        <Field label="טלפון" htmlFor="agency-phone">
          <PhoneField id="agency-phone" disabled={!canManage} value={form.phone}
                      onChange={(v) => set('phone', v)} />
        </Field>

        <Field label="אימייל ליצירת קשר" htmlFor="agency-email">
          <input id="agency-email" type="email" disabled={!canManage} className={inputClass} value={form.contactEmail}
                 onChange={(e) => set('contactEmail', e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="תיאור" htmlFor="agency-description">
            <textarea
              id="agency-description"
              rows={6}
              disabled={!canManage}
              className={inputClass}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="ספרו על הסוכנות — באילו אזורים אתם פועלים, במה אתם מתמחים."
            />
          </Field>
        </div>
      </section>

      {/*
        Its own panel with its own save, not part of the profile form: a branch is a row
        of its own, and pressing "שמור" on the profile should not be what commits one.
      */}
      {/*
        Not about the public page like the rest of this screen, but it is the agency's
        own decision, made by the same people, and it belongs where they already are.
      */}
      <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">שיתופי פעולה</h2>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            disabled={!canManage}
            checked={form.coBrokerage}
            onChange={(e) => set('coBrokerage', e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none"
          />
          <span>
            לקבל הצעות שיתוף פעולה מסוכנויות אחרות
            <span className="block text-xs text-slate-500">
              סוכנות שיש לה קונה לנכס שלכם תוכל לפנות אליכם. הנכסים שלכם ממילא מוצגים
              בלוח, ופרטי הלקוחות שלכם לעולם לא נחשפים.
            </span>
          </span>
        </label>
      </section>

      <OfficesPanel />

      {/* Development only, and the server refuses the routes elsewhere regardless. */}
      {import.meta.env.DEV && canManage && <DemoDataPanel />}

      <div className="flex items-center gap-2">
        {canManage ? (
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'שומר…' : 'שמור'}
          </Button>
        ) : (
          <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            רק בעלים של הסוכנות יכול לערוך את הפרטים האלה.
          </span>
        )}
        <span className="text-xs text-slate-500">
          {profile._count.listings} נכסים · {profile._count.leads} פניות · {profile._count.deals} עסקאות
        </span>
      </div>
    </div>
  );
}
