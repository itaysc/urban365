import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import { qk } from '@/queries/keys';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PhoneField } from '@/components/ui/PhoneField';
import {
  createPlatformInvite,
  createPlatformUser,
  fetchPlatformInvites,
  revokePlatformInvite,
} from '@/services/admin';

/** Inviting someone to the site. The role decides whether they get the CRM. */
export function PlatformInvites() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: invites = [] } = useQuery({
    queryKey: qk.admin.invites,
    queryFn: fetchPlatformInvites,
  });

  const [email, setEmail] = useState('');
  const [accountType, setAccountType] = useState<'buyer' | 'agency'>('buyer');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.admin.invites });

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await createPlatformInvite(email.trim(), accountType);
      toast.success(`נשלחה הזמנה ל${email.trim()}.`);
      setEmail('');
      setAccountType('buyer');
      await reload();
    } catch (e) {
      const message = errorMessageOf(e, 'שליחת ההזמנה נכשלה.');
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">הזמנת משתמש</h2>
      <p className="mt-1 text-sm text-slate-500">
        קישור חד-פעמי באימייל, תקף ל־3 ימים. משתמש רואה את החשבון שלו; סוכנות יכולה לפתוח את מערכת הניהול.
      </p>

      <form
        className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex-1">
          <Field label="אימייל" htmlFor="platform-invite-email">
            <input
              id="platform-invite-email"
              type="email"
              required
              dir="ltr"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </Field>
        </div>
        <Field label="סוג חשבון" htmlFor="platform-invite-role">
          <select
            id="platform-invite-role"
            className={selectClass}
            value={accountType}
            onChange={(e) => setAccountType(e.target.value === 'agency' ? 'agency' : 'buyer')}
          >
            <option value="buyer">משתמש</option>
            <option value="agency">סוכנות</option>
          </select>
        </Field>
        <Button type="submit" disabled={sending || !email.trim()}>
          {sending ? 'שולח…' : 'שלח הזמנה'}
        </Button>
      </form>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {invites.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-900">{invite.email}</p>
                <p className="text-xs text-slate-500">
                  {invite.accountType === 'agency' ? 'סוכנות' : 'משתמש'}
                  {' · '}
                  {invite.expired ? 'פג תוקף' : `תקף עד ${formatDate(invite.expiresAt)}`}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() =>
                  void revokePlatformInvite(invite.id)
                    .then(() => reload())
                    .catch(() => toast.error('הביטול נכשל.'))
                }
              >
                ביטול
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
    <CreateUser />
    </div>
  );
}

/** An account that exists as soon as the form is sent. The admin keeps the password. */
function CreateUser() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    accountType: 'buyer' as 'buyer' | 'agency',
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await createPlatformUser({
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        password: form.password,
        accountType: form.accountType,
        phone: form.phone.trim() || undefined,
      });
      toast.success(`נוצר חשבון עבור ${form.email.trim()}.`);
      setForm({ firstName: '', lastName: '', email: '', phone: '', password: '', accountType: 'buyer' });
      await queryClient.invalidateQueries({ queryKey: qk.admin.all });
    } catch (e) {
      const message = errorMessageOf(e, 'יצירת החשבון נכשלה.');
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">יצירת משתמש</h2>
      <p className="mt-1 text-sm text-slate-500">
        החשבון נפתח מיד, עם הסיסמה שתגדירו כאן. לא נשלחת הזמנה. סוכנות בלי משרד תתבקש לחבר אחד בכניסה.
      </p>

      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="שם פרטי" htmlFor="create-user-first" required>
          <input
            id="create-user-first"
            required
            className={inputClass}
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
          />
        </Field>
        <Field label="שם משפחה" htmlFor="create-user-last" required>
          <input
            id="create-user-last"
            required
            className={inputClass}
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
          />
        </Field>
        <Field label="אימייל" htmlFor="create-user-email" required>
          <input
            id="create-user-email"
            type="email"
            required
            dir="ltr"
            autoComplete="off"
            className={inputClass}
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="name@example.com"
          />
        </Field>
        <Field label="טלפון" htmlFor="create-user-phone">
          <PhoneField id="create-user-phone" value={form.phone} onChange={(value) => set('phone', value)} />
        </Field>
        <Field label="סוג חשבון" htmlFor="create-user-role">
          <select
            id="create-user-role"
            className={selectClass}
            value={form.accountType}
            onChange={(e) => set('accountType', e.target.value === 'agency' ? 'agency' : 'buyer')}
          >
            <option value="buyer">משתמש</option>
            <option value="agency">סוכנות</option>
          </select>
        </Field>
        <Field label="סיסמה" htmlFor="create-user-password" required>
          <PasswordInput
            id="create-user-password"
            required
            minLength={10}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={sending || form.password.length < 10}>
            {sending ? 'יוצר…' : 'צור משתמש'}
          </Button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
