import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import { qk } from '@/queries/keys';
import { createPlatformInvite, fetchPlatformInvites, revokePlatformInvite } from '@/services/admin';

/** Inviting a regular user. Lives on ניהול פלטפורמה, and does not attach an agency. */
export function PlatformInvites() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: invites = [] } = useQuery({
    queryKey: qk.admin.invites,
    queryFn: fetchPlatformInvites,
  });

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.admin.invites });

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await createPlatformInvite(email.trim());
      toast.success(`נשלחה הזמנה ל${email.trim()}.`);
      setEmail('');
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
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">הזמנת משתמש</h2>
      <p className="mt-1 text-sm text-slate-500">
        קישור חד-פעמי באימייל, תקף ל־3 ימים. החשבון הוא של משתמש רגיל, בלי סוכנות.
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
  );
}
