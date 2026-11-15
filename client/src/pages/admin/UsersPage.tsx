import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { inputClass, selectClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  assignUserToAgency,
  deleteUser,
  disableUser,
  enableUser,
  fetchAgencyDirectory,
  fetchUsers,
  setAgencyVertical,
  setUserRole,
  type ManagedAgency,
  type ManagedUser,
  type ManagedUserRole,
} from '@/services/admin';
import type { AgencyVertical } from '@/types/auth';

const ROLE_LABEL: Record<ManagedUserRole, string> = {
  buyer: 'משתמש רגיל',
  agency: 'סוכנות',
  admin: 'מנהל',
};

const VERTICAL_LABEL: Record<AgencyVertical, string> = {
  real_estate: 'נדל״ן',
  mortgage_broker: 'משכנתאות',
};

type Pending =
  | { kind: 'disable'; person: ManagedUser }
  | { kind: 'delete'; person: ManagedUser }
  | { kind: 'assign'; person: ManagedUser }
  | { kind: 'role'; person: ManagedUser; role: ManagedUserRole }
  | null;

function describe(pending: Exclude<Pending, null>): string {
  const name = `${pending.person.firstName} ${pending.person.lastName}`.trim();
  if (pending.kind === 'disable') {
    return `${name} לא יוכל להיכנס, ונכסים שפרסם בעצמו לא יוצגו באתר. אפשר להפעיל את החשבון אחר כך.`;
  }
  if (pending.kind === 'delete') {
    return `${name} יימחק לצמיתות ולא יוכל להיכנס. נכסים ופניות שפרסם בעצמו יימחקו. שיוך למשרד יוסר, ונתוני המשרד עצמם יישארו. אי אפשר לבטל את זה.`;
  }
  if (pending.kind === 'assign') {
    return `${name} ישויך כבעלים של הסוכנות שתיבחר, ויתנתק כדי שהשיוך ייכנס לתוקף.`;
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

function titleOf(pending: Exclude<Pending, null>): string {
  if (pending.kind === 'role') return 'לשנות את התפקיד?';
  if (pending.kind === 'delete') return 'למחוק את החשבון?';
  if (pending.kind === 'assign') return 'לשייך לסוכנות?';
  return 'להשבית את החשבון?';
}

function confirmLabelOf(pending: Exclude<Pending, null>): string {
  if (pending.kind === 'role') return 'שינוי';
  if (pending.kind === 'delete') return 'מחיקה';
  if (pending.kind === 'assign') return 'שיוך';
  return 'השבתה';
}

/**
 * Every account, and what it is allowed to be.
 *
 * Disabling blocks the next sign-in and hides listings this person published themselves.
 * Deleting removes the account: their own listings go with them, an office they belonged
 * to does not. Changing the role signs them out, so the next login is the one that
 * carries it. An agency account with no office can be attached to one here; otherwise
 * the next sign-in asks them to connect one. This page does not invent the office.
 */
export function UsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [officeTerm, setOfficeTerm] = useState('');
  const [debouncedOffice, setDebouncedOffice] = useState('');
  const [chosenOffice, setChosenOffice] = useState<ManagedAgency | null>(null);
  const [officeOpen, setOfficeOpen] = useState(false);
  const [officeHighlight, setOfficeHighlight] = useState(0);

  const { data: users = null } = useQuery({
    queryKey: qk.admin.users(submitted),
    queryFn: () => fetchUsers(submitted),
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedOffice(officeTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [officeTerm]);

  const officeQuery = useQuery({
    queryKey: qk.admin.directory(debouncedOffice),
    queryFn: () => fetchAgencyDirectory(debouncedOffice),
    enabled: pending?.kind === 'assign' && !chosenOffice && debouncedOffice.length >= 2,
  });
  const officeOptions = (officeQuery.data ?? []).filter(
    (office) => office.status !== 'deleted' && office.status !== 'suspended',
  );

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
          אפשר לשנות חשבון למשתמש רגיל, לסוכנות או למנהל, ולסוכנות — גם את סוג העסק (נדל״ן או משכנתאות).
          השבתה מונעת כניסה ומסתירה נכסים שהאדם פרסם בעצמו. מחיקה מוחקת את החשבון לצמיתות.
          חשבון סוכנות בלי משרד אפשר לשייך למשרד קיים.
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
                {person.agencyVertical ? ` · ${VERTICAL_LABEL[person.agencyVertical]}` : ''}
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
              {person.role === 'agency' && !person.agencyId && (
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => {
                    setOfficeTerm('');
                    setDebouncedOffice('');
                    setChosenOffice(null);
                    setOfficeOpen(false);
                    setOfficeHighlight(0);
                    setPending({ kind: 'assign', person });
                  }}
                >
                  שיוך לסוכנות
                </Button>
              )}
              {person.role === 'agency' && person.agencyId && person.agencyVertical && (
                <select
                  aria-label={`סוג העסק של ${person.agencyName}`}
                  className={selectClass}
                  value={person.agencyVertical}
                  disabled={busy !== null}
                  onChange={(event) => {
                    const vertical = event.target.value as AgencyVertical;
                    if (vertical !== person.agencyVertical) {
                      void run(person.id, () => setAgencyVertical(person.agencyId!, vertical));
                    }
                  }}
                >
                  {(Object.keys(VERTICAL_LABEL) as AgencyVertical[]).map((v) => (
                    <option key={v} value={v}>
                      {VERTICAL_LABEL[v]}
                    </option>
                  ))}
                </select>
              )}
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
              {person.id !== user?.id && (
                <Button variant="danger" disabled={busy !== null} onClick={() => setPending({ kind: 'delete', person })}>
                  מחיקה
                </Button>
              )}
            </div>
          </article>
        );
      })}

      <ConfirmDialog
        open={pending !== null}
        title={pending ? titleOf(pending) : ''}
        description={pending ? describe(pending) : ''}
        confirmLabel={pending ? confirmLabelOf(pending) : 'אישור'}
        confirmDisabled={pending?.kind === 'assign' && chosenOffice === null}
        busy={busy !== null}
        onConfirm={() => {
          const target = pending;
          const office = chosenOffice;
          setPending(null);
          setChosenOffice(null);
          setOfficeOpen(false);
          if (!target) return;
          if (target.kind === 'disable') void run(target.person.id, () => disableUser(target.person.id));
          else if (target.kind === 'delete') void run(target.person.id, () => deleteUser(target.person.id));
          else if (target.kind === 'assign' && office) {
            void run(target.person.id, () => assignUserToAgency(target.person.id, office.id));
          } else if (target.kind === 'role') {
            void run(target.person.id, () => setUserRole(target.person.id, target.role));
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setChosenOffice(null);
            setOfficeOpen(false);
          }
        }}
      >
        {pending?.kind === 'assign' && (
          <div className="relative mt-4">
            <input
              role="combobox"
              aria-expanded={officeOpen && debouncedOffice.length >= 2}
              aria-autocomplete="list"
              aria-controls="assign-office-list"
              autoComplete="off"
              value={officeTerm}
              onChange={(event) => {
                setOfficeTerm(event.target.value);
                setChosenOffice(null);
                setOfficeOpen(true);
                setOfficeHighlight(0);
              }}
              onFocus={() => setOfficeOpen(true)}
              onKeyDown={(event) => {
                if (!officeOpen || officeOptions.length === 0) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setOfficeHighlight((index) => (index + 1) % officeOptions.length);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setOfficeHighlight((index) => (index - 1 + officeOptions.length) % officeOptions.length);
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  const office = officeOptions[officeHighlight];
                  if (!office) return;
                  setChosenOffice(office);
                  setOfficeTerm(office.name);
                  setOfficeOpen(false);
                } else if (event.key === 'Escape') {
                  setOfficeOpen(false);
                }
              }}
              placeholder="הקלידו שם סוכנות"
              aria-label="חיפוש סוכנות"
              className={`${inputClass} w-full`}
            />
            {officeOpen && debouncedOffice.length >= 2 && (
              <ul
                id="assign-office-list"
                role="listbox"
                className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              >
                {officeQuery.isFetching && officeOptions.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">מחפש…</li>
                ) : officeOptions.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">אין סוכנויות להצגה.</li>
                ) : (
                  officeOptions.map((office, index) => (
                    <li key={office.id} role="option" aria-selected={index === officeHighlight}>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setChosenOffice(office);
                          setOfficeTerm(office.name);
                          setOfficeOpen(false);
                        }}
                        onMouseEnter={() => setOfficeHighlight(index)}
                        className={`flex w-full flex-col px-3 py-2 text-start text-sm ${
                          index === officeHighlight ? 'bg-slate-100' : ''
                        }`}
                      >
                        <span className="font-medium text-slate-900">{office.name}</span>
                        <span className="text-xs text-slate-500">
                          {office.status === 'unclaimed' ? 'לא שויכה' : 'פעילה'}
                          {office.yad2Id ? ` · יד2 ${office.yad2Id}` : ''}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )}
      </ConfirmDialog>
    </section>
  );
}
