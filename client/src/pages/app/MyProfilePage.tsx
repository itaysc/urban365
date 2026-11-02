import { useRef, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { IMAGE_TYPES } from '@/components/ui/Dropzone';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { Camera } from 'lucide-react';

/** Mirrors BIO_MAX_LENGTH on the server; the DTO is what actually enforces it. */
const BIO_MAX_LENGTH = 600;
import { errorMessageOf } from '@/lib/apiError';
import { removeMyAvatar, updateMyProfile, uploadMyAvatar } from '@/services/agency';
import { PhoneField } from '@/components/ui/PhoneField';

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
    bio: user?.bio ?? '',
  });
  /** Its own state, because the rest of the form is strings and this is a checkbox. */
  const [dailyBriefing, setDailyBriefing] = useState(user?.dailyBriefing ?? true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // A picture we host is served from our own path; anything else came from the identity
  // provider at sign-in and is worth saying so, since it is a default rather than a
  // choice they made.
  const fromGoogle = Boolean(user?.avatarUrl && !user.avatarUrl.startsWith('/api/'));

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await updateMyProfile({ ...form, dailyBriefing });
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
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared so choosing the same file twice still fires a change event.
              e.target.value = '';
              if (file) void upload(file);
            }}
          />

          {/* The picture is the control. A dropzone the size of the form was a lot of
              chrome for one 80px image. */}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            aria-label={user?.avatarUrl ? 'החלפת תמונת הפרופיל' : 'העלאת תמונת פרופיל'}
            className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            <Avatar
              size="lg"
              src={user?.avatarUrl}
              firstName={user?.firstName}
              lastName={user?.lastName}
            />

            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera size={22} aria-hidden />
            </span>
          </button>

          <div className="flex flex-col gap-1">
            <p className="text-xs text-slate-500">
              {uploading
                ? 'מעלה…'
                : !user?.avatarUrl
                  ? 'ללא תמונה מוצגות ראשי התיבות שלך. לחצו על העיגול כדי להעלות.'
                  : fromGoogle
                    ? 'התמונה מחשבון ה-Google שלך. לחצו עליה כדי להעלות אחרת.'
                    : 'התמונה מוצגת לצד הנכסים שלך. לחצו עליה כדי להחליף.'}
            </p>

            {user?.avatarUrl && (
              <div>
                <Button variant="ghost" className="px-0" onClick={() => void remove()}>
                  הסר תמונה
                </Button>
              </div>
            )}
          </div>
        </div>
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

        <div>
          <Field label="טלפון" htmlFor="me-phone">
            <PhoneField id="me-phone" value={form.phone} onChange={(v) => set('phone', v)}
                        placeholder="050-0000000" />
          </Field>
          {/* Describes the phone field, so it sits under it — and `aria-describedby`
              ties the two together for anyone not reading by position. */}
          <p id="me-phone-hint" className="mt-1 text-xs text-slate-500">
            המספר הזה יוצג לקונים שילחצו על «הצגת מספר טלפון» בנכסים שהעלית.
          </p>
        </div>

        <div className="sm:col-span-2">
          <Field label="קצת עליי" htmlFor="me-bio">
            <textarea
              id="me-bio"
              rows={4}
              // Belt and braces with the server's own limit: `maxLength` stops the typing,
              // the counter explains why, and the DTO refuses anything that gets past both.
              maxLength={BIO_MAX_LENGTH}
              className={inputClass}
              value={form.bio}
              onChange={(e) => set('bio', e.target.value)}
              placeholder="באילו אזורים אתם פועלים, באילו סוגי נכסים אתם מתמחים, כמה שנים בתחום."
            />
          </Field>
          <p
            className={`mt-1 text-xs ${
              form.bio.length >= BIO_MAX_LENGTH ? 'text-amber-700' : 'text-slate-500'
            }`}
          >
            {form.bio.length}/{BIO_MAX_LENGTH}
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={dailyBriefing}
              onChange={(e) => setDailyBriefing(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-none"
            />
            <span>
              מייל יומי עם ההזדמנויות שלי
              {/* What it actually does, so switching it off is an informed choice and
                  not a guess at what will stop arriving. */}
              <span className="block text-xs text-slate-500">
                נשלח בבוקר, ורק כשיש משהו לעשות.
              </span>
            </span>
          </label>
        </div>

        <div className="sm:col-span-2">
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'שומר…' : 'שמור'}
          </Button>
        </div>
      </section>
    </div>
  );
}
