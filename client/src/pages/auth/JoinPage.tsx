import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { PhoneField } from '@/components/ui/PhoneField';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import { acceptJoinInvite, fetchJoinInvite } from '@/services/admin';
import type { AuthUser } from '@/types/auth';
import { AuthLayout } from '@/pages/auth/AuthLayout';

/** The page a platform invite lands on. A regular account, not a place on a team. */
export function JoinPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', phone: '' });

  const { data: invite = null, isPending, isError } = useQuery({
    queryKey: ['join', token],
    queryFn: () => fetchJoinInvite(token),
    enabled: token !== '',
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const next = await acceptJoinInvite(token, form);
      queryClient.setQueryData<AuthUser | null>(qk.me, next);
      navigate('/', { replace: true });
    } catch (e) {
      setError(errorMessageOf(e, 'ההצטרפות נכשלה.'));
      setSubmitting(false);
    }
  };

  if (token !== '' && isPending) {
    return (
      <AuthLayout title="הצטרפות">
        <p className="text-sm text-slate-500">טוען…</p>
      </AuthLayout>
    );
  }

  if (!invite) {
    return (
      <AuthLayout title="ההזמנה אינה תקפה" subtitle={isError || !token ? 'ההזמנה אינה תקפה או שפג תוקפה.' : undefined}>
        <Link to="/login" className="text-sm text-blue-700 hover:underline">
          כניסה
        </Link>
      </AuthLayout>
    );
  }

  const wrongAccount = Boolean(user && user.email !== invite.email);

  return (
    <AuthLayout title="הצטרפות ל-Urban365" subtitle={invite.email}>
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      {wrongAccount ? (
        <p className="text-sm text-slate-700">
          את/ה מחובר/ת כ־{user!.email}. צריך להתנתק כדי לפתוח חשבון עבור {invite.email}.
        </p>
      ) : invite.hasAccount ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-700">כבר קיים חשבון עם הכתובת הזו. אפשר להתחבר.</p>
          <Link
            to="/login"
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
          <Field label="שם פרטי" htmlFor="join-first" required>
            <input
              id="join-first"
              required
              className={inputClass}
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
            />
          </Field>
          <Field label="שם משפחה" htmlFor="join-last" required>
            <input
              id="join-last"
              required
              className={inputClass}
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
            />
          </Field>
          <Field label="טלפון" htmlFor="join-phone">
            <PhoneField id="join-phone" value={form.phone} onChange={(value) => set('phone', value)} />
          </Field>
          <Field label="סיסמה" htmlFor="join-password" required>
            <input
              id="join-password"
              type="password"
              required
              minLength={10}
              className={inputClass}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'יוצר חשבון…' : 'יצירת חשבון'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
