import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import {
  changeMemberRole,
  fetchTeam,
  inviteMember,
  removeMember,
  revokeInvite,
  type AgencyRole,
  type TeamInvite,
  type TeamMember,
} from '@/services/agency';

const ROLE_LABEL: Record<AgencyRole, string> = { owner: 'בעלים', agent: 'סוכן' };

export function TeamPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<TeamMember | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AgencyRole>('agent');
  const [inviting, setInviting] = useState(false);

  // Only an owner may manage the team; an agent sees the roster read-only.
  const canManage = user?.agency?.role === 'owner' || user?.platformRole === 'admin';

  const load = useCallback(() => {
    setLoading(true);
    void fetchTeam()
      .then(({ members: m, invites: i }) => {
        setMembers(m);
        setInvites(i);
        setError(null);
      })
      .catch((e) => setError(errorMessageOf(e, 'לא הצלחנו לטעון את הצוות.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const submitInvite = async () => {
    setInviting(true);
    setError(null);
    try {
      await inviteMember(email.trim(), role);
      setNotice(`נשלחה הזמנה ל${email.trim()}.`);
      setEmail('');
      load();
    } catch (e) {
      setError(errorMessageOf(e, 'שליחת ההזמנה נכשלה.'));
    } finally {
      setInviting(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, fallback: string) => {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(errorMessageOf(e, fallback));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">הצוות</h1>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      {canManage && (
        <form
          className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void submitInvite();
          }}
        >
          <Field label="הזמנת חבר צוות" htmlFor="invite-email">
            <input
              id="invite-email"
              type="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
            />
          </Field>

          <Field label="תפקיד" htmlFor="invite-role">
            <select
              id="invite-role"
              className={inputClass}
              value={role}
              onChange={(e) => setRole(e.target.value as AgencyRole)}
            >
              <option value="agent">סוכן</option>
              <option value="owner">בעלים</option>
            </select>
          </Field>

          <Button type="submit" disabled={inviting || !email.trim()}>
            {inviting ? 'שולח…' : 'שלח הזמנה'}
          </Button>
        </form>
      )}

      {loading && <p className="text-sm text-slate-500">טוען…</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-900">חברי צוות</h2>

        <ul className="flex flex-col gap-2">
          {members.map((member) => {
            const isSelf = member.user.id === user?.id;

            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {member.user.firstName} {member.user.lastName}
                    {isSelf && <span className="ms-2 text-xs text-slate-400">(את/ה)</span>}
                  </p>
                  <p className="text-xs text-slate-500">{member.user.email}</p>
                </div>

                <div className="flex items-center gap-2">
                  {member.status !== 'active' && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      ממתין לאישור
                    </span>
                  )}

                  {canManage && !isSelf ? (
                    <select
                      className={`${inputClass} py-1 text-xs`}
                      value={member.role}
                      onChange={(e) =>
                        void act(
                          () => changeMemberRole(member.id, e.target.value as AgencyRole),
                          'שינוי התפקיד נכשל.',
                        )
                      }
                    >
                      <option value="agent">סוכן</option>
                      <option value="owner">בעלים</option>
                    </select>
                  ) : (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {ROLE_LABEL[member.role]}
                    </span>
                  )}

                  {canManage && !isSelf && (
                    <button
                      type="button"
                      className="text-xs text-red-700 hover:underline"
                      onClick={() => setToRemove(member)}
                    >
                      הסר
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {invites.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-900">הזמנות ממתינות</h2>

          <ul className="flex flex-col gap-2">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-900">{invite.email}</p>
                  <p className="text-xs text-slate-500">
                    {ROLE_LABEL[invite.role]} ·{' '}
                    {invite.expired ? 'פג תוקף' : `תקף עד ${formatDate(invite.expiresAt)}`}
                  </p>
                </div>

                {canManage && (
                  <button
                    type="button"
                    className="text-xs text-red-700 hover:underline"
                    onClick={() => void act(() => revokeInvite(invite.id), 'הביטול נכשל.')}
                  >
                    בטל הזמנה
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => !open && setToRemove(null)}
        title="להסיר מהצוות?"
        description={
          toRemove
            ? `${toRemove.user.firstName} ${toRemove.user.lastName} יאבד/תאבד גישה לסוכנות. החשבון עצמו יישאר פעיל.`
            : ''
        }
        confirmLabel="הסר"
        onConfirm={() => {
          const target = toRemove;
          setToRemove(null);
          if (target) void act(() => removeMember(target.id), 'ההסרה נכשלה.');
        }}
      />
    </div>
  );
}
