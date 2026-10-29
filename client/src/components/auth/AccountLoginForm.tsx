import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { GoogleButton, useGoogleAvailable } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';

interface Props {
  /** Where a Google sign-in should come back to — it leaves the page and returns. */
  returnTo: string;
  /** Called once the session exists. The page navigates; the dialog closes. */
  onSuccess: () => void;
  /**
   * Ids are prefixed because the dialog can be open over a page that already has a
   * login form, and two `id="account-email"` in one document makes the labels point at
   * whichever came first.
   */
  idPrefix?: string;
  /** Shown above the form — the OAuth callback sets one when it bounced someone back. */
  notice?: string | null;
}

/**
 * The buyer sign-in, shared by `/login` and the dialog the search page opens.
 *
 * One implementation on purpose: these two drifting apart is how a provider gets added
 * in one place and not the other.
 */
export function AccountLoginForm({ returnTo, onSuccess, idPrefix = 'account', notice }: Props) {
  const { login } = useAuth();
  const googleAvailable = useGoogleAvailable();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(form.email, form.password);
      onSuccess();
    } catch (err) {
      setError(errorMessageOf(err, 'האימייל או הסיסמה אינם נכונים.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {notice && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{notice}</p>}

      <GoogleButton returnTo={returnTo} />

      {googleAvailable && (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">או</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="אימייל" htmlFor={`${idPrefix}-email`} required>
          <input
            id={`${idPrefix}-email`}
            type="email"
            dir="ltr"
            required
            autoComplete="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </Field>

        <Field label="סיסמה" htmlFor={`${idPrefix}-password`} required>
          <input
            id={`${idPrefix}-password`}
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
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
  );
}
