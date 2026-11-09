import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { canUseCrm } from '@/lib/access';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import { fetchUsers, type ManagedUser } from '@/services/admin';

const ROLE_LABEL = {
  buyer: 'משתמש רגיל',
  agency: 'סוכנות',
  admin: 'מנהל',
} as const;

const VERTICAL_LABEL = {
  real_estate: 'נדל״ן',
  mortgage_broker: 'משכנתא',
} as const;

/**
 * An admin steps into somebody else's account.
 *
 * The list is the same directory as the users tab. Choosing a row rewrites the
 * session's access token; the red frame and the bar button are what make the
 * switch impossible to miss.
 */
export function SupportPanel() {
  const { user, impersonate } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: users = null } = useQuery({
    queryKey: qk.admin.users(submitted),
    queryFn: () => fetchUsers(submitted),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && busy === null) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  const choose = async (person: ManagedUser) => {
    setBusy(person.id);
    setError(null);
    try {
      const next = await impersonate(person.id);
      setOpen(false);
      navigate(canUseCrm(next) ? '/app' : '/', { replace: true });
    } catch (caught) {
      setError(errorMessageOf(caught, 'ההתחברות לחשבון נכשלה.'));
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-bold text-slate-900">תמיכה</h2>
        <p className="mt-1 text-sm text-slate-500">
          התחברות לחשבון של משתמש, כדי לראות את האתר כפי שהוא רואה אותו. מסגרת אדומה
          נשארת על המסך עד שיוצאים מההתחזות.
        </p>
      </div>

      <div>
        <Button type="button" onClick={() => setOpen(true)}>
          התחזות למשתמש
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="impersonate-title"
            className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 id="impersonate-title" className="text-lg font-bold text-slate-900">
                  בחירת משתמש
                </h3>
                <p className="text-sm text-slate-500">החשבון שאליו נכנסים עכשיו.</p>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
                onClick={() => busy === null && setOpen(false)}
              >
                סגירה
              </button>
            </div>

            <form
              className="flex gap-2 px-4 py-3"
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <Button type="submit" variant="secondary">
                חיפוש
              </Button>
            </form>

            {error && (
              <p className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
              {users === null && <p className="text-sm text-slate-500">טוען…</p>}

              {users?.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  אין משתמשים להצגה.
                </p>
              )}

              {users && users.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white text-slate-500">
                    <tr>
                      <th className="px-2 py-2 text-start font-medium">שם</th>
                      <th className="px-2 py-2 text-start font-medium">אימייל</th>
                      <th className="px-2 py-2 text-start font-medium">סוג</th>
                      <th className="px-2 py-2 text-start font-medium">סוכנות</th>
                      <th className="px-2 py-2 text-start font-medium">תחום</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((person) => {
                      const name = `${person.firstName} ${person.lastName}`.trim();
                      const mine = person.id === user?.id;
                      const blocked = mine || person.disabled || busy !== null;
                      return (
                        <tr key={person.id} className="border-t border-slate-100">
                          <td className="px-2 py-2 font-medium text-slate-900">{name}</td>
                          <td className="px-2 py-2 text-slate-600">{person.email}</td>
                          <td className="px-2 py-2 text-slate-600">
                            {ROLE_LABEL[person.role]}
                            {person.disabled ? ' · מושבת' : ''}
                          </td>
                          <td className="px-2 py-2 text-slate-600">{person.agencyName ?? '—'}</td>
                          <td className="px-2 py-2 text-slate-600">
                            {person.agencyVertical ? VERTICAL_LABEL[person.agencyVertical] : '—'}
                          </td>
                          <td className="px-2 py-2 text-end">
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={blocked}
                              title={mine ? 'זה החשבון שלך' : person.disabled ? 'החשבון מושבת' : undefined}
                              onClick={() => void choose(person)}
                            >
                              {busy === person.id ? 'נכנס…' : 'התחזה'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
