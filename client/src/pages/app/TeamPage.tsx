import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { useAuth } from '@/auth/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
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
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isPending: loading } = useQuery({ queryKey: qk.team.list, queryFn: fetchTeam });
  const members = data?.members ?? [];
  const invites = data?.invites ?? [];

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.team.all });
  const [toRemove, setToRemove] = useState<TeamMember | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AgencyRole>('agent');
  const [inviting, setInviting] = useState(false);

  // Only an owner may manage the team; an agent sees the roster read-only.
  const canManage = user?.agency?.role === 'owner' || user?.platformRole === 'admin';


  const submitInvite = async () => {
    setInviting(true);
    setError(null);
    try {
      await inviteMember(email.trim(), role);
      toast.success(`נשלחה הזמנה ל${email.trim()}.`);
      setEmail('');
      await reload();
    } catch (e) {
      const message = errorMessageOf(e, 'שליחת ההזמנה נכשלה.');
      setError(message);
      toast.error(message);
    } finally {
      setInviting(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, fallback: string, done?: string) => {
    setError(null);
    try {
      await fn();
      if (done) toast.success(done);
      await reload();
    } catch (e) {
      const message = errorMessageOf(e, fallback);
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">הצוות</h1>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
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
              className={selectClass}
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
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar firstName={member.user.firstName} lastName={member.user.lastName} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {member.user.firstName} {member.user.lastName}
                      {isSelf && <span className="ms-2 text-xs text-slate-400">(את/ה)</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {member.user.email}
                      {member.user.phone && ` · ${member.user.phone}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {member.status !== 'active' && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      ממתין לאישור
                    </span>
                  )}

                  {canManage && !isSelf ? (
                    <select
                      className={`${selectClass} py-1 text-xs`}
                      value={member.role}
                      onChange={(e) =>
                        void act(
                          () => changeMemberRole(member.id, e.target.value as AgencyRole),
                          'שינוי התפקיד נכשל.',
                          'התפקיד עודכן.',
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
                    onClick={() => void act(() => revokeInvite(invite.id), 'הביטול נכשל.', 'ההזמנה בוטלה.')}
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
          if (target) void act(() => removeMember(target.id), 'ההסרה נכשלה.', 'החבר הוסר מהצוות.');
        }}
      />
    </div>
  );
}
