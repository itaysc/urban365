import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ClipboardList,
  Contact,
  Handshake,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { BarSeries } from '@/components/agency/BarSeries';
import { formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import { fetchOverview, type Overview } from '@/services/overview';

const STAGE_LABEL: Record<string, string> = {
  qualified: 'מתאים',
  negotiation: 'במשא ומתן',
  under_contract: 'בחוזה',
  closed_won: 'נסגרו',
  closed_lost: 'לא יצאו',
};

const MONTH_NAMES = [
  'ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני',
  'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ',
];

/** `2026-W44` → `44`, `2026-11` → `נוב`. Four characters is what a phone bar holds. */
const weekLabel = (key: string) => key.split('-W')[1] ?? key;
const monthLabel = (key: string) => MONTH_NAMES[Number(key.split('-')[1]) - 1] ?? key;

/**
 * One line that needs doing, drawn as a link because every one of them is somewhere
 * to go. Zero is drawn too, quietly: "nothing waiting" is worth knowing and a card
 * that vanishes when it is empty makes the page jump about between visits.
 */
function Waiting({
  icon: Icon,
  label,
  value,
  to,
  urgent = false,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: number;
  to: string;
  urgent?: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-900"
    >
      <span className="flex items-center gap-2 text-sm text-slate-600">
        <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        {label}
      </span>
      <span
        className={`text-2xl font-bold ${
          value === 0 ? 'text-slate-300' : urgent ? 'text-blue-700' : 'text-slate-900'
        }`}
      >
        {value}
      </span>
    </Link>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * The first screen of the day.
 *
 * Ordered the way an agent's morning goes rather than the way the database is laid
 * out: what is waiting on me, then what the pipeline is worth, then whether the last
 * three months were better or worse than this one. Three listing counts — which is all
 * this page used to be — are at the bottom, because an agency knows how many listings
 * it has and none of them is a thing to do today.
 *
 * One request behind all of it. Six cards from six hooks is six spinners arriving in
 * six different orders, and a page that flickers is one people stop reading.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const { data, isPending } = useQuery({ queryKey: qk.overview, queryFn: fetchOverview });

  const empty: Overview['today'] = {
    viewingsToday: 0,
    viewingsThisWeek: 0,
    awaitingFeedback: 0,
    openLeads: 0,
    openSuggestions: 0,
    coBrokerageWaiting: 0,
  };
  const today = data?.today ?? empty;
  const pipeline = data?.pipeline;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">שלום {user?.firstName}</h1>
        <p className="text-sm text-slate-500">
          {isPending
            ? 'טוען…'
            : today.viewingsToday > 0
              ? `${today.viewingsToday} ביקורים היום, ${today.viewingsThisWeek} השבוע`
              : `אין ביקורים היום. ${today.viewingsThisWeek} השבוע`}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">מה מחכה לכם</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Waiting
            icon={Sparkles}
            label="הזדמנויות פתוחות"
            value={today.openSuggestions}
            to="/app/radar"
            urgent
          />
          <Waiting
            icon={Contact}
            label="פניות שלא נסגרו"
            value={today.openLeads}
            to="/app/leads"
          />
          <Waiting
            icon={ClipboardList}
            label="ביקורים ללא סיכום"
            value={today.awaitingFeedback}
            to="/app/calendar"
          />
          <Waiting
            icon={CalendarDays}
            label="ביקורים השבוע"
            value={today.viewingsThisWeek}
            to="/app/calendar"
          />
          <Waiting
            icon={Handshake}
            label="בקשות שיתוף פעולה"
            value={today.coBrokerageWaiting}
            to="/app/cobrokerage"
            urgent
          />
        </div>
      </section>

      {pipeline && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-900">צבר העסקאות</h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <Figure
              label="עסקאות פתוחות"
              value={String(pipeline.openCount)}
              hint={pipeline.openValue > 0 ? formatPrice(pipeline.openValue) : undefined}
            />
            <Figure
              label="עמלה צפויה"
              value={pipeline.openCommission > 0 ? formatPrice(pipeline.openCommission) : '—'}
              hint="מהעסקאות הפתוחות"
            />
            <Figure
              label="נסגרו בהצלחה"
              value={String(pipeline.wonCount)}
              hint={pipeline.wonCommission > 0 ? formatPrice(pipeline.wonCommission) : undefined}
            />
          </div>

          {/* The board as one line, so "everything is stuck at the first stage" is
              visible without opening it. */}
          {pipeline.stages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pipeline.stages.map((s) => (
                <Link
                  key={s.stage}
                  to="/app/deals"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-900"
                >
                  {STAGE_LABEL[s.stage] ?? s.stage}
                  <span className="ms-2 font-semibold text-slate-900">{s.count}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">פניות לפי שבוע</h2>
          <p className="mb-3 text-xs text-slate-500">שלושת החודשים האחרונים</p>
          {data && (
            <BarSeries
              bars={data.leadsByWeek.map((w) => ({
                label: weekLabel(w.key),
                value: w.count,
                title: `שבוע ${weekLabel(w.key)}: ${w.count} פניות`,
              }))}
            />
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">עסקאות שנסגרו</h2>
          <p className="mb-3 text-xs text-slate-500">
            כחול — נסגרו בהצלחה, אפור — לא יצאו לפועל
          </p>
          {data && (
            <BarSeries
              bars={data.dealsByMonth.map((m) => ({
                label: monthLabel(m.key),
                value: m.won,
                secondary: m.lost,
                title: `${monthLabel(m.key)}: ${m.won} נסגרו, ${m.lost} לא יצאו`,
              }))}
            />
          )}
        </div>
      </section>

      {data && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-900">הנכסים שלכם</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['published', 'פורסמו'],
                ['draft', 'טיוטות'],
                ['archived', 'בארכיון'],
              ] as const
            ).map(([status, label]) => (
              <Link
                key={status}
                to={`/app/listings?status=${status}`}
                className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-900"
              >
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.listings[status]}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
