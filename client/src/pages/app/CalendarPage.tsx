import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, User } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import { apiBaseUrl } from '@/services/api';
import { fetchTeam } from '@/services/agency';
import { MeetingForm } from '@/pages/app/MeetingForm';
import {
  createMeeting,
  deleteMeeting,
  disconnectGoogleCalendar,
  fetchGoogleCalendarStatus,
  fetchMeetings,
  updateMeeting,
  type Meeting,
  type MeetingInput,
} from '@/services/calendar';

const DAY_NAMES = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const startOfMonth = (at: Date) => new Date(at.getFullYear(), at.getMonth(), 1);

/**
 * The grid always starts on a Sunday and runs whole weeks, so the month sits in a
 * rectangle rather than a ragged shape — and the days either side are shown greyed
 * rather than blank, because a viewing on the 1st is still next to one on the 31st.
 */
function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

export function CalendarPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [editing, setEditing] = useState<Meeting | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Meeting | null>(null);

  const { user } = useAuth();
  // An owner may look at the team's diaries; an agent only their own, which the server
  // enforces either way.
  const isOwner = user?.agency?.role === 'owner' || user?.platformRole === 'admin';
  /** `''` is mine, `'all'` the team's, anything else one agent's. */
  const [whose, setWhose] = useState('');

  const days = useMemo(() => monthGrid(month), [month]);
  // Read once, when the page opens, rather than 42 times while drawing one grid — a
  // clock called in a loop can land on either side of midnight. It goes stale in a tab
  // left open overnight, which is a better trade than the highlight moving under
  // somebody mid-click.
  const [today] = useState(() => new Date());
  const from = days[0];
  const to = useMemo(() => {
    const end = new Date(days[days.length - 1]);
    end.setDate(end.getDate() + 1);
    return end;
  }, [days]);

  const { data: google } = useQuery({
    queryKey: qk.meetings.google,
    queryFn: fetchGoogleCalendarStatus,
  });

  const { data: team } = useQuery({
    queryKey: qk.team.list,
    queryFn: fetchTeam,
    enabled: isOwner,
  });

  const { data, isPending } = useQuery({
    queryKey: qk.meetings.range(from.toISOString(), to.toISOString(), google?.connected ?? false, whose),
    queryFn: () =>
      fetchMeetings({
        from: from.toISOString(),
        to: to.toISOString(),
        ownerId: whose || undefined,
        // Only ever your own, whichever diary is on screen: a colleague's private
        // calendar is not something this page can ask for.
        google: google?.connected,
      }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.meetings.all });

  const save = useMutation({
    mutationFn: (input: MeetingInput) =>
      editing && editing !== 'new' ? updateMeeting(editing.id, input) : createMeeting(input),
    onSuccess: () => {
      void refresh();
      toast.success(editing === 'new' ? 'הפגישה נקבעה.' : 'הפגישה עודכנה.');
      setEditing(null);
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לשמור את הפגישה.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMeeting(id),
    onSuccess: () => {
      void refresh();
      toast.success('הפגישה בוטלה.');
      setDeleting(null);
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לבטל את הפגישה.')),
  });

  const disconnect = useMutation({
    mutationFn: disconnectGoogleCalendar,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.meetings.all });
      toast.success('היומן נותק.');
    },
  });

  const meetings = data?.items ?? [];
  const googleEvents = data?.googleEvents ?? [];

  const onDay = (day: Date) => meetings.filter((m) => sameDay(new Date(m.startsAt), day));
  const googleOnDay = (day: Date) => googleEvents.filter((e) => sameDay(new Date(e.startsAt), day));

  const connected = params.get('googleConnected') === '1';
  const googleError = params.get('googleError');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">יומן</h1>
          <p className="text-sm text-slate-500">
            {isPending ? 'טוען…' : `${meetings.length} פגישות בחודש הזה`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isOwner && (
            <select
              className={selectClass}
              value={whose}
              onChange={(e) => setWhose(e.target.value)}
              aria-label="יומן של"
            >
              <option value="">היומן שלי</option>
              <option value="all">כל הצוות</option>
              {(team?.members ?? [])
                .filter((m) => m.status === 'active' && m.user.id !== user?.id)
                .map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.firstName} {m.user.lastName}
                  </option>
                ))}
            </select>
          )}

          {editing === null && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              פגישה חדשה
            </Button>
          )}
        </div>
      </header>

      {(connected || googleError) && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            googleError ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
          }`}
        >
          {googleError ?? 'יומן Google חובר. הפגישות שתקבעו כאן יופיעו גם שם.'}
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="ms-2 underline"
          >
            סגירה
          </button>
        </p>
      )}

      {/*
        The connection is per person, not per agency: it is somebody's own calendar, and
        two agents at one agency each connect their own.
      */}
      {google?.available && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm">
            <p className="font-medium text-slate-900">יומן Google</p>
            {google.connected ? (
              <p className="text-slate-500">
                מחובר{google.googleEmail ? ` — ${google.googleEmail}` : ''}. הפגישות שנקבעות כאן
                נכתבות גם ליומן שלכם, והאירועים שלכם מוצגים כאן.
              </p>
            ) : (
              <p className="text-slate-500">
                חיבור היומן יציג כאן גם את האירועים שלכם, ויכתוב לשם כל פגישה שתקבעו.
              </p>
            )}
            {google.lastError && <p className="mt-1 text-amber-700">{google.lastError}</p>}
          </div>

          {google.connected ? (
            <Button variant="secondary" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              ניתוק
            </Button>
          ) : (
            // A plain link, not a fetch: the browser has to follow Google's redirect
            // itself, the same way the sign-in button does.
            <a
              href={`${apiBaseUrl}/my/calendar/google/connect`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-900"
            >
              חיבור יומן Google
            </a>
          )}
        </section>
      )}

      {editing !== null && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-4 font-semibold text-slate-900">
            {editing === 'new' ? 'פגישה חדשה' : 'עריכת פגישה'}
          </h2>
          <MeetingForm
            meeting={editing === 'new' ? null : editing}
            busy={save.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(input) => save.mutate(input)}
          />
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="החודש הקודם"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="החודש הבא"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <h2 className="font-semibold text-slate-900">
            {month.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
          </h2>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const ours = onDay(day);
            const theirs = googleOnDay(day);
            const outside = day.getMonth() !== month.getMonth();
            const isToday = sameDay(day, today);

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelected(day)}
                className={`flex min-h-[4.5rem] flex-col items-stretch gap-1 rounded-lg border p-1.5 text-start transition ${
                  sameDay(day, selected)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                } ${outside ? 'opacity-40' : ''}`}
              >
                <span
                  className={`text-xs ${isToday ? 'font-bold text-blue-700' : 'text-slate-500'}`}
                >
                  {day.getDate()}
                </span>

                {ours.slice(0, 2).map((m) => (
                  <span
                    key={m.id}
                    className="truncate rounded bg-blue-600 px-1 py-0.5 text-[0.65rem] text-white"
                  >
                    {time(m.startsAt)} {m.title}
                  </span>
                ))}

                {/* Google's own events, drawn differently because they are not ours to
                    edit — a grey chip rather than a solid one. */}
                {theirs.slice(0, 1).map((e) => (
                  <span
                    key={e.id}
                    className="truncate rounded bg-slate-200 px-1 py-0.5 text-[0.65rem] text-slate-700"
                  >
                    {e.title}
                  </span>
                ))}

                {ours.length + theirs.length > 3 && (
                  <span className="text-[0.65rem] text-slate-400">
                    ועוד {ours.length + theirs.length - 3}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-slate-900">
          {selected.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>

        {onDay(selected).length === 0 && googleOnDay(selected).length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            אין פגישות ביום הזה.
          </p>
        )}

        {onDay(selected).map((meeting) => (
          <article key={meeting.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  <span className="text-blue-700">
                    {time(meeting.startsAt)}–{time(meeting.endsAt)}
                  </span>{' '}
                  {meeting.title}
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  {meeting.customer && (
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" aria-hidden />
                      {meeting.customer.name}
                      {meeting.customer.phone && (
                        <a href={`tel:${meeting.customer.phone}`} dir="ltr" className="hover:underline">
                          {meeting.customer.phone}
                        </a>
                      )}
                    </span>
                  )}
                  {meeting.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {meeting.location}
                    </span>
                  )}
                  {/* Only when looking at somebody else's: on your own diary, every
                      line saying your own name is noise. */}
                  {whose !== '' && meeting.owner && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {meeting.owner.firstName} {meeting.owner.lastName}
                    </span>
                  )}
                  {meeting.googleEventId && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                      ביומן Google
                    </span>
                  )}
                </div>

                {meeting.notes && (
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-500">{meeting.notes}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => setEditing(meeting)}
                  className="text-blue-700 hover:underline"
                >
                  עריכה
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(meeting)}
                  className="text-slate-500 hover:text-red-700"
                >
                  ביטול
                </button>
              </div>
            </div>
          </article>
        ))}

        {googleOnDay(selected).map((event) => (
          <article
            key={event.id}
            className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm"
          >
            <p className="font-medium text-slate-700">
              <span className="text-slate-500">
                {time(event.startsAt)}–{time(event.endsAt)}
              </span>{' '}
              {event.title}
            </p>
            <p className="mt-1 text-xs text-slate-400">מיומן Google שלכם — לעריכה שם</p>
          </article>
        ))}
      </section>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="לבטל את הפגישה?"
        description={
          deleting?.googleEventId
            ? 'הפגישה תימחק גם מיומן Google.'
            : 'הפגישה תימחק מהיומן.'
        }
        confirmLabel="ביטול הפגישה"
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
