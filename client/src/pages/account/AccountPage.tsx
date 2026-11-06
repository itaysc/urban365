import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Plus } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { SellerListings } from '@/components/seller/SellerListings';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { IMAGE_TYPES } from '@/components/ui/Dropzone';
import { Field, inputClass } from '@/components/ui/Field';
import { PhoneField } from '@/components/ui/PhoneField';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { removeMyAvatar, updateMyProfile, uploadMyAvatar } from '@/services/agency';

/**
 * A regular user's own page: their details, and the listings they published.
 *
 * Not the CRM. An agency or an admin opens that from the same avatar.
 */
export function AccountPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await updateMyProfile({
        ...form,
        bio: user?.bio ?? '',
        dailyBriefing: user?.dailyBriefing ?? true,
      });
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

  const removePhoto = async () => {
    try {
      await removeMyAvatar();
      await refresh();
      toast.success('תמונת הפרופיל הוסרה.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'לא הצלחנו להסיר את התמונה.'));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main id="main" tabIndex={-1} className="mx-auto flex max-w-4xl flex-col gap-8 p-4 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">החשבון שלי</h1>

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
                e.target.value = '';
                if (file) void upload(file);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              aria-label={user?.avatarUrl ? 'החלפת תמונת הפרופיל' : 'העלאת תמונת פרופיל'}
              className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              <Avatar size="lg" src={user?.avatarUrl} firstName={user?.firstName} lastName={user?.lastName} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera size={22} aria-hidden />
              </span>
            </button>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-slate-500">
                {uploading ? 'מעלה…' : 'לחצו על העיגול כדי להעלות או להחליף תמונה.'}
              </p>
              {user?.avatarUrl && (
                <Button variant="ghost" className="px-0" onClick={() => void removePhoto()}>
                  הסר תמונה
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <Field label="שם פרטי" htmlFor="account-first">
            <input
              id="account-first"
              className={inputClass}
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
            />
          </Field>
          <Field label="שם משפחה" htmlFor="account-last">
            <input
              id="account-last"
              className={inputClass}
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
            />
          </Field>
          <Field label="אימייל" htmlFor="account-email">
            <input id="account-email" className={inputClass} value={user?.email ?? ''} disabled dir="ltr" />
          </Field>
          <div>
            <Field label="טלפון" htmlFor="account-phone">
              <PhoneField
                id="account-phone"
                value={form.phone}
                onChange={(v) => set('phone', v)}
                placeholder="050-0000000"
              />
            </Field>
            <p className="mt-1 text-xs text-slate-500">
              המספר הזה יוצג למי שילחץ על «הצגת מספר טלפון» בנכסים שלכם.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? 'שומר…' : 'שמור'}
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">הנכסים שלי</h2>
            <Link
              to="/sell/new"
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" aria-hidden />
              פרסום נכס
            </Link>
          </div>
          <SellerListings />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
