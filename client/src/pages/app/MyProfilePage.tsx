import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { removeMyAvatar, updateMyProfile, uploadMyAvatar } from '@/services/agency';

/**
 * The member's own details — open to every role, unlike the team page, because this is
 * theirs. The phone here is what a buyer sees behind "show number" on this agent's
 * listings, in preference to the agency switchboard.
 */
export function MyProfilePage() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await updateMyProfile(form);
      // The header shows the name and picture from the auth context, so it has to be
      // re-read or it keeps displaying what was there before.
      await refresh();
      toast.success('הפרטים נשמרו.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'השמירה נכשלה.'));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      await uploadMyAvatar(file);
      await refresh();
      toast.success('תמונת הפרופיל עודכנה.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'העלאת התמונה נכשלה.'));
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    try {
      await removeMyAvatar();
      await refresh();
      toast.success('תמונת הפרופיל הוסרה.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'לא הצלחנו להסיר את התמונה.'));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">הפרופיל שלי</h1>

      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">תמונת פרופיל</h2>

        <div className="flex items-center gap-4">
          <Avatar
            size="lg"
            src={user?.avatarUrl}
            firstName={user?.firstName}
            lastName={user?.lastName}
          />
          <p className="text-xs text-slate-500">
            {user?.avatarUrl ? 'התמונה מוצגת לצד הנכסים שלך.' : 'ללא תמונה מוצגות ראשי התיבות שלך.'}
          </p>
        </div>

        <Dropzone disabled={uploading} onFiles={(files) => void upload(files[0])}>
          {uploading ? 'מעלה…' : 'גררו תמונה לכאן או לחצו לבחירה'}
        </Dropzone>

        {user?.avatarUrl && (
          <div>
            <Button variant="ghost" onClick={() => void remove()}>
              הסר תמונה
            </Button>
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Field label="שם פרטי" htmlFor="me-first">
          <input id="me-first" className={inputClass} value={form.firstName}
                 onChange={(e) => set('firstName', e.target.value)} />
        </Field>

        <Field label="שם משפחה" htmlFor="me-last">
          <input id="me-last" className={inputClass} value={form.lastName}
                 onChange={(e) => set('lastName', e.target.value)} />
        </Field>

        <Field label="אימייל" htmlFor="me-email">
          {/* Changing an address would need re-verification, which is its own flow. */}
          <input id="me-email" className={inputClass} value={user?.email ?? ''} disabled dir="ltr" />
        </Field>

        <Field label="טלפון" htmlFor="me-phone">
          <input id="me-phone" type="tel" dir="ltr" className={inputClass} value={form.phone}
                 onChange={(e) => set('phone', e.target.value)} placeholder="050-0000000" />
        </Field>

        <div className="sm:col-span-2">
          <p className="mb-3 text-xs text-slate-500">
            המספר הזה יוצג לקונים שילחצו על «הצגת מספר טלפון» בנכסים שהעלית.
          </p>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'שומר…' : 'שמור'}
          </Button>
        </div>
      </section>
    </div>
  );
}
