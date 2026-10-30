import { useFormik } from 'formik';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import * as Yup from 'yup';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { safeReturnTo } from '@/lib/returnTo';
import { AuthLayout } from '@/pages/auth/AuthLayout';
import { errorCodeOf, errorMessageOf } from '@/lib/apiError';
import { GoogleButton, useGoogleAvailable } from '@/components/auth/GoogleButton';

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const googleAvailable = useGoogleAvailable();

  const verified = params.get('verified');
  // Set by the OAuth callback when it bounced somebody back rather than signing them in.
  const googleError = params.get('googleError');

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema: Yup.object({
      email: Yup.string().email('כתובת אימייל לא תקינה').required('שדה חובה'),
      password: Yup.string().required('שדה חובה'),
    }),
    onSubmit: async (values, helpers) => {
      setFormError(null);
      try {
        await login(values.email, values.password);
        navigate(safeReturnTo((location.state as { from?: string } | null)?.from), { replace: true });
      } catch (e) {
        // Keyed on the server's code where there is one, never on message text.
        setFormError(
          errorCodeOf(e) === 'EMAIL_NOT_VERIFIED'
            ? 'צריך לאמת את כתובת האימייל לפני ההתחברות.'
            : errorMessageOf(e, 'כתובת האימייל או הסיסמה שגויים.'),
        );
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  if (!loading && user) return <Navigate to="/app" replace />;

  return (
    <AuthLayout
      title="התחברות"
      subtitle="לניהול הנכסים, הפניות והעסקאות של הסוכנות"
    >
      {verified === '1' && (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          כתובת האימייל אומתה. אפשר להתחבר.
        </p>
      )}
      {verified === '0' && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          קישור האימות אינו תקף או שפג תוקפו.
        </p>
      )}

      {googleError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{googleError}</p>
      )}

      {/*
        The same Google sign-in the buyer pages offer, against the same accounts: an
        agent whose address is already registered is linked to that account rather than
        given a second one. Returning to /app rather than / because that is what an
        agent came here for; without an agency yet, the guard there sends them on to
        the one page that can fix that.
      */}
      <div className="mb-4 flex flex-col gap-4">
        <GoogleButton returnTo="/app" />

        {googleAvailable && (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">או</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        )}
      </div>

      <form onSubmit={formik.handleSubmit} className="flex flex-col gap-4">
        <Field label="אימייל" htmlFor="email" required error={formik.touched.email && formik.errors.email}>
          <input id="email" type="email" dir="ltr" autoComplete="email" className={inputClass} {...formik.getFieldProps('email')} />
        </Field>

        <Field label="סיסמה" htmlFor="password" required error={formik.touched.password && formik.errors.password}>
          <input id="password" type="password" autoComplete="current-password" className={inputClass} {...formik.getFieldProps('password')} />
        </Field>

        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}

        <Button type="submit" disabled={formik.isSubmitting}>
          {formik.isSubmitting ? 'מתחבר…' : 'התחברות'}
        </Button>

        <Link to="/forgot-password" className="text-center text-xs text-slate-500 hover:underline">
          שכחתי סיסמה
        </Link>

        {/* Signing up is the other half of this screen, not a footnote: a new agency
            arrives here first. It used to sit only under the card, below the fold on a
            short window, where it was easy to miss entirely. */}
        <div className="flex items-center gap-3 pt-2">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">או</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <Link
          to="/agency/signup"
          className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-800 transition hover:border-slate-900"
        >
          רישום סוכנות חדשה
        </Link>
      </form>
    </AuthLayout>
  );
}
