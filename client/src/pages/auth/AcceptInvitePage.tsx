import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { AuthLayout } from '@/pages/auth/AuthLayout';
import { errorCodeOf, errorMessageOf } from '@/lib/apiError';
import { acceptInvite, fetchInvite } from '@/services/agency';
import { PhoneField } from '@/components/ui/PhoneField';

const ROLE_LABEL: Record<string, string> = { owner: 'בעלים', agent: 'סוכן' };

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { user, recheck } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', phone: '' });

  const { data: invite = null, isPending, isError } = useQuery({
    queryKey: qk.invite(token),
    queryFn: () => fetchInvite(token),
    enabled: token !== '',
    // A bad or expired token is an answer, not a transport failure.
    retry: false,
    // Single-use: never serve a second read from cache.
    staleTime: 0,
    gcTime: 0,
  });

  const loading = token !== '' && isPending;

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // An existing account sends nothing: the session identifies them, and the server
      // checks it matches the invited address.
      await acceptInvite(token, invite?.hasAccount ? {} : form);

      // Whether they just signed up or were already signed in, their access token does
      // not name this agency yet — rotate before landing on the dashboard, or every
      // tenant route 403s until it expires.
      await recheck();
      navigate('/app', { replace: true });
    } catch (e) {
      if (errorCodeOf(e) === 'invite_requires_login') {
        setError('כבר קיים חשבון עם הכתובת הזו. התחבר/י ואז פתח/י שוב את הקישור.');
      } else {
        setError(errorMessageOf(e, 'ההצטרפות נכשלה.'));
      }
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthLayout title="הזמנה לצוות">
        <p className="text-sm text-slate-500">טוען…</p>
      </AuthLayout>
    );
  }

  if (!invite) {
    return (
      <AuthLayout
        title="ההזמנה אינה תקפה"
        subtitle={error ?? (isError || !token ? 'ההזמנה אינה תקפה או שפג תוקפה.' : undefined)}
      >
        <Link to="/" className="text-sm text-blue-700 hover:underline">
          חזרה לחיפוש
        </Link>
      </AuthLayout>
    );
  }

  // Signed in as somebody else: accepting would attach the invite to the wrong account,
  // which the server refuses anyway — say so before they fill anything in.
  const wrongAccount = Boolean(user && user.email !== invite.email);

  return (
    <AuthLayout
      title={`הצטרפות ל${invite.agencyName}`}
      subtitle={`הוזמנת בתור ${ROLE_LABEL[invite.role] ?? invite.role} · ${invite.email}`}
    >
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      {wrongAccount ? (
        <p className="text-sm text-slate-700">
          את/ה מחובר/ת כ־{user!.email}. צריך להתנתק ולהתחבר עם {invite.email} כדי לקבל את
          ההזמנה.
        </p>
      ) : invite.hasAccount && !user ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-700">
            כבר קיים חשבון עם הכתובת הזו. התחבר/י כדי להצטרף לצוות.
          </p>
          <Link
            to="/login"
            state={{ from: `/accept-invite?token=${encodeURIComponent(token)}` }}
            className="rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-slate-800"
          >
            התחברות
          </Link>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {!invite.hasAccount && (
            <>
              <Field label="שם פרטי" htmlFor="invite-first" required>
                <input id="invite-first" required className={inputClass} value={form.firstName}
                       onChange={(e) => set('firstName', e.target.value)} />
              </Field>

              <Field label="שם משפחה" htmlFor="invite-last" required>
                <input id="invite-last" required className={inputClass} value={form.lastName}
                       onChange={(e) => set('lastName', e.target.value)} />
              </Field>

              <Field label="טלפון" htmlFor="invite-phone">
                <PhoneField id="invite-phone" value={form.phone} onChange={(v) => set('phone', v)} />
              </Field>

              <Field label="סיסמה" htmlFor="invite-password" required>
                <PasswordInput id="invite-password" required minLength={10} autoComplete="new-password"
                       value={form.password} onChange={(e) => set('password', e.target.value)} />
              </Field>
            </>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'מצטרף…' : 'הצטרפות לצוות'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
