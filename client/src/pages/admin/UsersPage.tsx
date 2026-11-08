import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { selectClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  disableUser,
  enableUser,
  fetchUsers,
  setUserRole,
  type ManagedUser,
  type ManagedUserRole,
} from '@/services/admin';

const ROLE_LABEL: Record<ManagedUserRole, string> = {
  buyer: 'משתמש רגיל',
  agency: 'סוכנות',
  admin: 'מנהל',
};

type Pending =
  | { kind: 'disable'; person: ManagedUser }
  | { kind: 'role'; person: ManagedUser; role: ManagedUserRole }
  | null;

function describe(pending: Exclude<Pending, null>): string {
  const name = `${pending.person.firstName} ${pending.person.lastName}`.trim();
  if (pending.kind === 'disable') {
    return `${name} לא יוכל להיכנס, ונכסים שפרסם בעצמו לא יוצגו באתר. אפשר להפעיל את החשבון אחר כך.`;
  }

  const next = ROLE_LABEL[pending.role];
  if (pending.role === 'agency' && !pending.person.agencyName) {
    return `${name} יסומן כ${next}. אין לו משרד משויך, אז בכניסה הבאה יתבקש לחבר אחד.`;
  }
  if (pending.role === 'agency' && pending.person.agencyName) {
    return `${name} יסומן כ${next} של ${pending.person.agencyName}, ויתנתק כדי שהשינוי ייכנס לתוקף.`;
  }
  return `${name} יסומן כ${next}, ויתנתק כדי שהשינוי ייכנס לתוקף.`;
}

/**
 * Every account, and what it is allowed to be.
 *
 * Disabling blocks the next sign-in and hides listings this person published themselves.
 * Changing the role signs them out, so the next login is the one that carries it. An
 * agency with no office is asked to connect one; this page does not invent the office.
 */
export function UsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

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
    } catch (caught) {
      setError(errorMessageOf(caught, 'הפעולה נכשלה.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-bold text-slate-900">משתמשים</h2>
        <p className="mt-1 text-sm text-slate-500">
          אפשר לשנות חשבון למשתמש רגיל, לסוכנות או למנהל. השבתה מונעת כניסה ומסתירה נכסים שהאדם פרסם בעצמו.
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
                {ROLE_LABEL[person.role]}
                {person.agencyName ? ` · ${person.agencyName}` : ''}
                {person.disabled ? ' · מושבת' : ''}
                {!person.emailVerified ? ' · אימייל לא אומת' : ''}
                {` · הצטרף ${formatDate(person.createdAt)}`}
                {person.lastLoginAt ? ` · כניסה אחרונה ${formatDate(person.lastLoginAt)}` : ''}
                {` · ${person.publishedCount} נכסים בפרסום`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`תפקיד של ${name}`}
                className={selectClass}
                value={person.role}
                disabled={busy !== null || person.id === user?.id}
                onChange={(event) => {
                  const role = event.target.value as ManagedUserRole;
                  if (role !== person.role) setPending({ kind: 'role', person, role });
                }}
              >
                {(Object.keys(ROLE_LABEL) as ManagedUserRole[]).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
              {person.disabled ? (
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void run(person.id, () => enableUser(person.id))}
                >
                  {busy === person.id ? 'מעדכן…' : 'הפעלה'}
                </Button>
              ) : (
                <Button variant="danger" disabled={busy !== null} onClick={() => setPending({ kind: 'disable', person })}>
                  השבתה
                </Button>
              )}
            </div>
          </article>
        );
      })}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'role' ? 'לשנות את התפקיד?' : 'להשבית את החשבון?'}
        description={pending ? describe(pending) : ''}
        confirmLabel={pending?.kind === 'role' ? 'שינוי' : 'השבתה'}
        busy={busy !== null}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (!target) return;
          if (target.kind === 'disable') void run(target.person.id, () => disableUser(target.person.id));
          else void run(target.person.id, () => setUserRole(target.person.id, target.role));
        }}
        onOpenChange={(open) => !open && setPending(null)}
      />
    </section>
  );
}
