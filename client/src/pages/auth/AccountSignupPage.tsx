import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { GoogleButton, useGoogleAvailable } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { signupBuyer } from '@/services/auth';
import { TermsNotice } from '@/components/auth/TermsCheckbox';
import { AuthLayout } from '@/pages/auth/AuthLayout';
import { PhoneField } from '@/components/ui/PhoneField';

const PASSWORD_MIN = 10;

/** Consumer signup: identity only, no agency anywhere in it. */
export function AccountSignupPage() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const googleAvailable = useGoogleAvailable();

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signupBuyer({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        // The sentence above the form is the agreement; submitting is what accepts it.
        acceptedTerms: true,
      });
      // The response already set the cookies; this pulls the user into the cache so the
      // header and guards see them without a reload.
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessageOf(err, 'ההרשמה נכשלה.'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="הרשמה"
      subtitle="כדי לשמור נכסים ולקבל עדכונים"
      footer={
        <>
          כבר יש לך חשבון?{' '}
          <Link to="/login" className="text-blue-700 hover:underline">
            כניסה
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TermsNotice />
        <GoogleButton label="הרשמה עם Google" />

        {googleAvailable && (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-500">או</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="שם פרטי" htmlFor="su-first" required>
              <input id="su-first" required className={inputClass} value={form.firstName}
                     onChange={(e) => set('firstName', e.target.value)} />
            </Field>
            <Field label="שם משפחה" htmlFor="su-last" required>
              <input id="su-last" required className={inputClass} value={form.lastName}
                     onChange={(e) => set('lastName', e.target.value)} />
            </Field>
          </div>

          <Field label="אימייל" htmlFor="su-email" required>
            <input id="su-email" type="email" dir="ltr" required autoComplete="email"
                   className={inputClass} value={form.email}
                   onChange={(e) => set('email', e.target.value)} />
          </Field>

          <Field label="טלפון" htmlFor="su-phone">
            <PhoneField id="su-phone" value={form.phone} onChange={(v) => set('phone', v)}
                        placeholder="050-0000000" />
          </Field>

          <Field label="סיסמה" htmlFor="su-password" required>
            <input id="su-password" type="password" required minLength={PASSWORD_MIN}
                   autoComplete="new-password" className={inputClass} value={form.password}
                   onChange={(e) => set('password', e.target.value)} />
          </Field>
          <p className="-mt-2 text-xs text-slate-500">
            לפחות {PASSWORD_MIN} תווים, עם אות גדולה, אות קטנה וספרה.
          </p>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'נרשם…' : 'הרשמה'}
          </Button>
        </form>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4 text-center">
        <Link to="/agency/signup" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
          רישום סוכנות נדל״ן ←
        </Link>
      </div>
    </AuthLayout>
  );
}
