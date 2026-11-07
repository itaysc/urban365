import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/format';
import { qk } from '@/queries/keys';
import { disableUser, enableUser, fetchUsers, type ManagedUser } from '@/services/admin';

/**
 * Ordinary accounts: people searching for a home or selling their own.
 *
 * Disabling blocks the next sign-in and hides the listings they published. Turning the
 * account back on shows those listings again. Agency staff are managed with their agency.
 */
export function UsersPage() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ManagedUser | null>(null);

  const { data: users = null } = useQuery({
    queryKey: qk.admin.users(submitted),
    queryFn: () => fetchUsers(submitted),
  });

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: qk.admin.all });
    } catch {
      setError('הפעולה נכשלה.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">משתמשים</h1>
        <p className="mt-1 text-sm text-slate-500">
          חשבונות של אנשים פרטיים. השבתה מונעת כניסה ומסתירה את הנכסים שהם פרסמו.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(term.trim());
        }}
      >
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="חיפוש לפי שם או אימייל"
          aria-label="חיפוש משתמש"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <Button type="submit" variant="secondary">
          חיפוש
        </Button>
      </form>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {users === null && <p className="text-sm text-slate-500">טוען…</p>}

      {users?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          אין משתמשים להצגה.
        </p>
      )}

      {users?.map((person) => {
        const name = `${person.firstName} ${person.lastName}`.trim();
        return (
          <article
            key={person.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{name}</p>
              <p className="text-xs text-slate-500">
                {person.email}
                {person.phone ? ` · ${person.phone}` : ''}
              </p>
              <p className="text-xs text-slate-500">
                {person.disabled ? 'מושבת' : 'פעיל'}
                {!person.emailVerified ? ' · אימייל לא אומת' : ''}
                {` · הצטרף ${formatDate(person.createdAt)}`}
                {person.lastLoginAt ? ` · כניסה אחרונה ${formatDate(person.lastLoginAt)}` : ''}
                {` · ${person.publishedCount} נכסים בפרסום`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {person.disabled ? (
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void run(person.id, () => enableUser(person.id))}
                >
                  {busy === person.id ? 'מעדכן…' : 'הפעלה'}
                </Button>
              ) : (
                <Button variant="danger" disabled={busy !== null} onClick={() => setPending(person)}>
                  השבתה
                </Button>
              )}
            </div>
          </article>
        );
      })}

      <ConfirmDialog
        open={pending !== null}
        title="להשבית את החשבון?"
        description={
          pending
            ? `${pending.firstName} ${pending.lastName} לא יוכל להיכנס, והנכסים שפרסם לא יוצגו באתר. אפשר להפעיל את החשבון אחר כך.`
            : ''
        }
        confirmLabel="השבתה"
        busy={busy !== null}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (target) void run(target.id, () => disableUser(target.id));
        }}
        onOpenChange={(open) => !open && setPending(null)}
      />
    </section>
  );
}
