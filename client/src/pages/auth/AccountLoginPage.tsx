import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { GoogleButton, useGoogleAvailable } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { safeReturnTo } from '@/lib/returnTo';
import { AuthLayout } from '@/pages/auth/AuthLayout';

/**
 * The front door for buyers, which is most people — so it is `/login`, and the agency
 * sign-in is a link from it rather than the other way round. Same shape yad2 uses.
 */
export function AccountLoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const googleAvailable = useGoogleAvailable();
  const location = useLocation();
  const [params] = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const returnTo = safeReturnTo((location.state as { from?: string } | null)?.from, '/');
  // Set by the OAuth callback when it bounced someone back rather than signing them in.
  const googleError = params.get('googleError');

  if (!loading && user) return <Navigate to={returnTo} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(form.email, form.password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(errorMessageOf(err, 'האימייל או הסיסמה אינם נכונים.'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="כניסה"
      subtitle="כדי לשמור נכסים ולקבל עדכונים"
      footer={
        <>
          אין לך חשבון?{' '}
          <Link to="/signup" className="text-blue-700 hover:underline">
            הרשמה
          </Link>
        </>
      }
    >
      {googleError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{googleError}</p>
      )}

      <div className="flex flex-col gap-4">
        <GoogleButton returnTo={returnTo} />

        {googleAvailable && (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">או</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="אימייל" htmlFor="account-email" required>
            <input id="account-email" type="email" dir="ltr" required autoComplete="email"
                   className={inputClass} value={form.email}
                   onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>

          <Field label="סיסמה" htmlFor="account-password" required>
            <input id="account-password" type="password" required autoComplete="current-password"
                   className={inputClass} value={form.password}
                   onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </Field>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'מתחבר…' : 'כניסה'}
          </Button>

          <Link to="/forgot-password" className="text-center text-xs text-slate-500 hover:underline">
            שכחתי סיסמה
          </Link>
        </form>
      </div>

      {/* The crossing to the other side of the product, as yad2 does with
          "כניסה למתווכים". A buyer never needs it; an agent always looks for it. */}
      <div className="mt-6 border-t border-slate-200 pt-4 text-center">
        <Link to="/agency/login" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
          כניסה לסוכנויות נדל״ן ←
        </Link>
      </div>
    </AuthLayout>
  );
}
