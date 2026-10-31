import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, Check, ChevronLeft, ChevronRight, MailCheck, MapPin, Plus, User, X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { gridFor, isoDay, VIEW_LABEL, VIEWS, type View } from '@/lib/calendarSpan';
import { qk } from '@/queries/keys';
import { apiBaseUrl } from '@/services/api';
import { fetchTeam } from '@/services/agency';
import { MeetingForm } from '@/pages/app/MeetingForm';
import { ViewingFeedbackForm } from '@/pages/app/ViewingFeedbackForm';
import { OUTCOME_CLASS, OUTCOME_LABEL } from '@/lib/viewingOutcome';
import {
  createMeeting,
  deleteMeeting,
  disconnectGoogleCalendar,
  fetchGoogleCalendarStatus,
  completeFollowUp,
  fetchAwaitingFeedback,
  fetchFollowUps,
  fetchMeetings,
  recordViewingFeedback,
  sendMeetingConfirmation,
  type ViewingOutcome,
  updateMeeting,
  type Meeting,
  type MeetingInput,
} from '@/services/calendar';

const DAY_NAMES = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/**
 * Nine in the morning on that day, as a `datetime-local` value.
 *
 * A booking has to start somewhere, and the start of the working day is a better guess
 * than the hour somebody happened to click at — they are picking a date, not a time.
 */
const localSlot = (at: Date) => `${isoDay(at)}T09:00`;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

export function CalendarPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  /**
   * Which day is selected, and whether a form is open, live in the url.
   *
   * So the browser's Back button closes the form and returns to the month somebody was
   * looking at, which is what Back means to everybody — and so a half-filled booking
   * survives a reload and can be linked to.
   */
  const dayParam = params.get('day');
  const newAt = params.get('new');
  const editingId = params.get('edit');

  // The clock is read once on mount and then only ever through `today`, so a day with
  // no `?day=` in the url still means "today" without calling a clock mid-render.
  const [today] = useState(() => new Date());
  const selected = useMemo(() => (dayParam ? new Date(dayParam) : today), [dayParam, today]);

  /** In the url like everything else, so a week someone is looking at can be linked. */
  const viewParam = params.get('view');
  const view: View = (VIEWS as readonly string[]).includes(viewParam ?? '')
    ? (viewParam as View)
    : 'month';

  /**
   * Where the grid sits. The selected day drives it: moving between views keeps you
   * looking at the same day rather than jumping back to today, which is the whole
   * reason somebody switches from a month to a week.
   */
  const anchor = selected;
  const [deleting, setDeleting] = useState<Meeting | null>(null);
  /** Which meeting is being written up, if any. */
  const [summarising, setSummarising] = useState<string | null>(null);

  /** Replaces, rather than pushes, when only the day changes: browsing a month should
   *  not leave thirty entries in the history to walk back through. */
  const go = (patch: Record<string, string | null>, push = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: !push });
  };

  const openNew = (at: Date) => go({ day: isoDay(at), new: localSlot(at) }, true);
  const closeForm = () => go({ new: null, edit: null }, true);

  const { user } = useAuth();
  // An owner may look at the team's diaries; an agent only their own, which the server
  // enforces either way.
  const isOwner = user?.agency?.role === 'owner' || user?.platformRole === 'admin';
  /** `''` is mine, `'all'` the team's, anything else one agent's. */
  const [whose, setWhose] = useState('');

  const days = useMemo(() => gridFor(view, anchor), [view, anchor]);

  /**
   * Back and forward move by whatever is on screen: a day, a week, a month. The
   * selected day moves with it, so the grid and the list under it stay about the same
   * stretch of time.
   */
  const step = (direction: 1 | -1) => {
    const next = new Date(anchor);
    if (view === 'day') next.setDate(next.getDate() + direction);
    else if (view === 'week') next.setDate(next.getDate() + 7 * direction);
    else next.setMonth(next.getMonth() + direction);
    go({ day: isoDay(next) });
  };

  /** What the heading says: a date, a span of dates, or a month. */
  const spanLabel = (() => {
    if (view === 'day') {
      return anchor.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    if (view === 'week') {
      const last = days[days.length - 1];
      const short = (at: Date) => at.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
      return `${short(days[0])} – ${short(last)}`;
    }
    return anchor.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  })();
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
      closeForm();
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

  const { data: awaiting } = useQuery({
    queryKey: qk.meetings.awaitingFeedback,
    queryFn: fetchAwaitingFeedback,
  });

  const { data: followUps } = useQuery({
    queryKey: qk.meetings.followUps,
    queryFn: fetchFollowUps,
  });

  const chased = useMutation({
    mutationFn: (id: string) => completeFollowUp(id),
    onSuccess: () => {
      void refresh();
      toast.success('סומן כטופל.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לעדכן.')),
  });

  const feedback = useMutation({
    mutationFn: ({
      id,
      outcome,
      notes,
      followUpInDays,
    }: {
      id: string;
      outcome: ViewingOutcome;
      notes: string;
      followUpInDays: number;
    }) => recordViewingFeedback(id, outcome, notes, followUpInDays),
    onSuccess: () => {
      void refresh();
      toast.success('הסיכום נשמר.');
      setSummarising(null);
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לשמור את הסיכום.')),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => sendMeetingConfirmation(id),
    onSuccess: (result) => {
      void refresh();
      if (result.sent) toast.success('בקשת האישור נשלחה ללקוח.');
      // Not an error: most customers are a phone number, and the agent needs to know
      // this one has to be rung instead of waiting for a reply that cannot come.
      else toast.show(result.reason ?? 'אין למי לשלוח.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לשלוח את בקשת האישור.')),
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

  const editing: Meeting | 'new' | null = newAt
    ? 'new'
    : (meetings.find((m) => m.id === editingId) ?? null);

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
            <Button onClick={() => openNew(selected)}>
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

      {/*
        People to ring back, before anything else on the page: a viewing that went well
        and was never followed up is the most expensive thing on this screen.
      */}
      {(followUps?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <h2 className="text-sm font-semibold text-blue-900">
            לחזור אליהם ({followUps!.length})
          </h2>

          {followUps!.map((meeting) => (
            <div
              key={meeting.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-800">
                  {meeting.customer?.name ?? meeting.title}
                  {meeting.customer?.phone && (
                    <a
                      href={`tel:${meeting.customer.phone}`}
                      dir="ltr"
                      className="ms-2 text-slate-500 hover:text-slate-900"
                    >
                      {meeting.customer.phone}
                    </a>
                  )}
                  {meeting.outcome && (
                    <span
                      className={`ms-2 rounded px-2 py-0.5 text-xs ${OUTCOME_CLASS[meeting.outcome]}`}
                    >
                      {OUTCOME_LABEL[meeting.outcome]}
                    </span>
                  )}
                </p>

                {/* What they said last time, which is the whole reason this call is
                    worth making rather than a cold one. */}
                {meeting.feedbackNotes && (
                  <p className="mt-1 text-sm text-slate-500">{meeting.feedbackNotes}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => chased.mutate(meeting.id)}
                disabled={chased.isPending}
                className="shrink-0 text-sm text-blue-700 hover:underline disabled:opacity-50"
              >
                טופל
              </button>
            </div>
          ))}
        </section>
      )}

      {/*
        Last week's viewing is not on screen when somebody is looking at next month, so
        the chase lives at the top of the page rather than in the grid. Oldest first:
        the one that has been waiting longest is the one most likely to be forgotten.
      */}
      {(awaiting?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            ממתינות לסיכום ({awaiting!.length})
          </h2>

          {awaiting!.map((meeting) => (
            <div key={meeting.id} className="rounded-lg bg-white p-3">
              <p className="text-sm text-slate-800">
                <span className="text-slate-500">
                  {new Date(meeting.startsAt).toLocaleDateString('he-IL', {
                    day: 'numeric',
                    month: 'long',
                  })}
                </span>{' '}
                {meeting.title}
                {meeting.customer && <span className="text-slate-500"> · {meeting.customer.name}</span>}
              </p>

              {summarising === meeting.id ? (
                <div className="mt-3">
                  <ViewingFeedbackForm
                    busy={feedback.isPending}
                    onCancel={() => setSummarising(null)}
                    onSubmit={(outcome, notes, followUpInDays) =>
                      feedback.mutate({ id: meeting.id, outcome, notes, followUpInDays })
                    }
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSummarising(meeting.id)}
                  className="mt-1 text-sm text-blue-700 hover:underline"
                >
                  סיכום הביקור
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {editing !== null && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-4 font-semibold text-slate-900">
            {editing === 'new' ? 'פגישה חדשה' : 'עריכת פגישה'}
          </h2>
          <MeetingForm
            meeting={editing === 'new' ? null : editing}
            defaultStart={newAt ?? undefined}
            busy={save.isPending}
            onCancel={closeForm}
            onSubmit={(input) => save.mutate(input)}
          />
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="אחורה"
              onClick={() => step(-1)}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="קדימה"
              onClick={() => step(1)}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go({ day: isoDay(today) })}
              className="rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
            >
              היום
            </button>
          </div>

          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-slate-900">{spanLabel}</h2>

            {/* Three spans of the same grid, so switching keeps the day you are on. */}
            <div className="flex overflow-hidden rounded-lg border border-slate-300">
              {VIEWS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  onClick={() => go({ view: option })}
                  className={`px-3 py-1 text-sm transition ${
                    view === option
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {VIEW_LABEL[option]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {view !== 'day' && (
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
        )}

        <div className={view === 'day' ? 'grid grid-cols-1' : 'grid grid-cols-7 gap-1'}>
          {days.map((day) => {
            const ours = onDay(day);
            const theirs = googleOnDay(day);
            // Only a month has days from outside it; a week is all its own.
            const outside = view === 'month' && day.getMonth() !== anchor.getMonth();
            const isToday = sameDay(day, today);

            return (
              <button
                key={day.toISOString()}
                type="button"
                // A day with nothing in it is an invitation to book: there is nothing
                // else clicking it could usefully mean. A day with meetings selects,
                // so the list below can be read without a form opening over it.
                onClick={() =>
                  ours.length + theirs.length === 0 ? openNew(day) : go({ day: isoDay(day) })
                }
                className={`flex flex-col items-stretch gap-1 rounded-lg border p-1.5 text-start transition ${
                  view === 'month' ? 'min-h-[4.5rem]' : 'min-h-[9rem]'
                } ${
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

                {ours.slice(0, view === 'month' ? 2 : 8).map((m) => (
                  <span
                    key={m.id}
                    className="truncate rounded bg-blue-600 px-1 py-0.5 text-[0.65rem] text-white"
                  >
                    {time(m.startsAt)} {m.title}
                  </span>
                ))}

                {/* Google's own events, drawn differently because they are not ours to
                    edit — a grey chip rather than a solid one. */}
                {theirs.slice(0, view === 'month' ? 1 : 4).map((e) => (
                  <span
                    key={e.id}
                    className="truncate rounded bg-slate-200 px-1 py-0.5 text-[0.65rem] text-slate-700"
                  >
                    {e.title}
                  </span>
                ))}

                {view === 'month' && ours.length + theirs.length > 3 && (
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
          <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm text-slate-500">אין פגישות ביום הזה.</p>
            <Button variant="secondary" onClick={() => openNew(selected)}>
              <Plus className="h-4 w-4" aria-hidden />
              קביעת פגישה ביום הזה
            </Button>
          </div>
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

                  {/* Three states worth telling apart: confirmed, declined, and asked
                      but not answered — which is the one an agent should chase. */}
                  {meeting.attendeeResponse === 'confirmed' && (
                    <span className="flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 text-xs text-green-800">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      הלקוח אישר
                    </span>
                  )}
                  {meeting.attendeeResponse === 'declined' && (
                    <span className="flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs text-red-800">
                      <X className="h-3.5 w-3.5" aria-hidden />
                      הלקוח ביטל
                    </span>
                  )}
                  {meeting.attendeeResponse === 'pending' && meeting.confirmationSentAt && (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                      ממתין לתשובת הלקוח
                    </span>
                  )}
                </div>

                {meeting.notes && (
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-500">{meeting.notes}</p>
                )}

                {meeting.outcome && (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded px-2 py-0.5 text-xs ${OUTCOME_CLASS[meeting.outcome]}`}>
                      {OUTCOME_LABEL[meeting.outcome]}
                    </span>
                    {meeting.feedbackNotes && (
                      <span className="text-slate-600">{meeting.feedbackNotes}</span>
                    )}
                  </p>
                )}

                {summarising === meeting.id && (
                  <div className="mt-3 rounded-lg border border-slate-200 p-3">
                    <ViewingFeedbackForm
                      outcome={meeting.outcome}
                      notes={meeting.feedbackNotes}
                      busy={feedback.isPending}
                      onCancel={() => setSummarising(null)}
                      onSubmit={(outcome, notes, followUpInDays) =>
                        feedback.mutate({ id: meeting.id, outcome, notes, followUpInDays })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3 text-sm">
                {/* Only once it is over: asking how a viewing went before it has
                    happened is a question with no answer. */}
                {new Date(meeting.endsAt) < today && summarising !== meeting.id && (
                  <button
                    type="button"
                    onClick={() => setSummarising(meeting.id)}
                    className="text-blue-700 hover:underline"
                  >
                    {meeting.outcome ? 'עריכת הסיכום' : 'סיכום הביקור'}
                  </button>
                )}
                {meeting.customerId && (
                  <button
                    type="button"
                    onClick={() => confirm.mutate(meeting.id)}
                    disabled={confirm.isPending}
                    className="flex items-center gap-1 text-blue-700 hover:underline disabled:opacity-50"
                  >
                    <MailCheck className="h-4 w-4" aria-hidden />
                    {meeting.confirmationSentAt ? 'שליחה מחדש' : 'בקשת אישור'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => go({ edit: meeting.id }, true)}
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
