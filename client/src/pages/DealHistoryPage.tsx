import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/auth-context';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { CityBox } from '@/components/listing/CityBox';
import { StreetBox } from '@/components/listing/StreetBox';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { panelClass } from '@/components/mortgage/panel';
import { ROOM_STEPS } from '@/components/search/roomsRange';
import { Button } from '@/components/ui/Button';
import { Field, selectClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate, formatShekel } from '@/lib/format';
import { splitHouseNumber } from '@/lib/house-number';
import { fetchMarketHistory, type MarketHistory } from '@/services/market-history';

/**
 * Recorded sales around a street, for someone with an account.
 *
 * The registry has no addresses, so the page says what it actually shows: full
 * residential sales within a few hundred metres, not "this building". The yearly
 * median is the picture; the table is the sales behind it.
 */
export function DealHistoryPage({ embedded = false }: { embedded?: boolean }) {
  const { user, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const needsAccount = !embedded && !loading && user === null;
  const signInTrigger = useRef<HTMLButtonElement>(null);

  const [params, setParams] = useSearchParams();
  const initial = useState(() => readHistoryQuery(params))[0];
  const [city, setCity] = useState(initial.city);
  const [street, setStreet] = useState(initial.street);
  const [rooms, setRooms] = useState(initial.rooms);
  // What חפש last asked for. Typing changes the fields and nothing else; a link that
  // already names a street counts as that ask, so it still opens on the sales.
  const [submitted, setSubmitted] = useState<HistoryQuery | null>(() => askedQuery(initial));

  const remember = (next: HistoryQuery) => {
    setSubmitted(next);
    const query = new URLSearchParams();
    query.set('city', next.city);
    query.set('street', next.street);
    if (next.rooms) query.set('rooms', next.rooms);
    if (next.year) query.set('year', next.year);
    setParams(query, { replace: true, preventScrollReset: true });
  };

  const search = (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    const next = askedQuery({ city, street, rooms, year: '' });
    if (next) remember(next);
  };

  const roomsNumber = submitted?.rooms ? Number(submitted.rooms) : undefined;
  const yearNumber = submitted?.year ? Number(submitted.year) : undefined;

  const result = useQuery({
    queryKey: ['market-history', submitted?.city ?? '', submitted?.street ?? '', roomsNumber ?? null, yearNumber ?? null],
    queryFn: () =>
      fetchMarketHistory({
        city: submitted!.city,
        street: submitted!.street,
        ...(roomsNumber !== undefined ? { rooms: roomsNumber } : {}),
        ...(yearNumber !== undefined ? { year: yearNumber } : {}),
      }),
    enabled: Boolean(user) && submitted !== null,
  });

  const found = result.data?.ok ? result.data : null;

  useEffect(() => {
    if (!found || !submitted?.year) return;
    if (!found.byYear.some((bar) => String(bar.year) === submitted.year)) {
      remember({ ...submitted, year: '' });
    }
  }, [found, submitted]);

  const body = (
    <>
      <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">עסקאות שנרשמו</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        מחירי דירות שנמכרו בפועל בסביבת הרחוב, מתוך מרשם העסקאות. לא המחיר שמופיע במודעה,
        ולא שמאות.
      </p>

      {needsAccount ? (
        <section className={`${panelClass} mt-5 max-w-xl`}>
          <h2 className="text-base font-semibold text-slate-800">צריך חשבון כדי לראות עסקאות</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            היסטוריית העסקאות פתוחה למשתמשים רשומים. ההרשמה קצרה ובחינם.
          </p>
          <button
            type="button"
            ref={signInTrigger}
            onClick={() => setDismissed(false)}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            התחברות או הרשמה
          </button>
        </section>
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          <form
            className={`${panelClass} grid min-w-0 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto]`}
            onSubmit={search}
          >
            <Field label="עיר" htmlFor="history-city" required>
              <CityBox id="history-city" value={city} onChange={setCity} required />
            </Field>
            <Field label="רחוב" htmlFor="history-street" required>
              <StreetBox id="history-street" city={city} value={street} onChange={setStreet} />
            </Field>
            <Field label="חדרים" htmlFor="history-rooms">
              <select
                id="history-rooms"
                className={selectClass}
                value={rooms}
                onChange={(event) => setRooms(event.target.value)}
              >
                <option value="">הכל</option>
                {ROOM_STEPS.map((step) => (
                  <option key={step} value={step}>
                    {step}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit">חפש</Button>
          </form>

          <section aria-live="polite" aria-busy={result.isFetching} className="flex flex-col gap-5">
            {result.isError && (
              <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">
                {errorMessageOf(result.error, 'לא הצלחנו לטעון את העסקאות.')}
              </p>
            )}
            {result.isFetching && !found && submitted && (
              <p className="text-sm text-slate-500">מחפש עסקאות…</p>
            )}
            {result.data && !result.data.ok && (
              <HistoryMiss
                miss={result.data}
                onStreet={(name) => {
                  setStreet(name);
                  const next = askedQuery({ city, street: name, rooms, year: '' });
                  if (next) remember(next);
                }}
              />
            )}
            {found && submitted && (
              <HistoryResult
                history={found}
                year={submitted.year}
                onYear={(value) => remember({ ...submitted, year: value })}
              />
            )}
            {!submitted && !needsAccount && user && (
              <p className="text-sm text-slate-500">מלאו עיר ורחוב, ולחצו על חפש.</p>
            )}
          </section>
        </div>
      )}

      {!embedded && (
        <LoginDialog
          open={needsAccount && !dismissed}
          onOpenChange={(open) => setDismissed(!open)}
          returnFocusTo={signInTrigger}
          description="כדי לראות עסקאות שנרשמו"
          returnTo="/history"
        />
      )}
    </>
  );

  if (embedded) return body;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--paper)]">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        {body}
      </main>
      <SiteFooter />
    </div>
  );
}

interface HistoryQuery {
  city: string;
  street: string;
  rooms: string;
  year: string;
}

/** A search worth sending: a town and a street, with the house number left off. */
function askedQuery(fields: HistoryQuery): HistoryQuery | null {
  const city = fields.city.trim();
  const street = splitHouseNumber(fields.street).name.trim();
  if (city.length < 2 || street.length < 2) return null;
  return { city, street, rooms: fields.rooms, year: fields.year };
}

function readHistoryQuery(params: URLSearchParams): HistoryQuery {
  return {
    city: params.get('city') ?? '',
    street: params.get('street') ?? '',
    rooms: params.get('rooms') ?? '',
    year: params.get('year') ?? '',
  };
}

function HistoryMiss({
  miss,
  onStreet,
}: {
  miss: { reason: 'city' | 'street' | 'point'; choices?: string[]; street?: string };
  onStreet: (street: string) => void;
}) {
  if (miss.reason === 'city') {
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        אין במאגר עסקאות שנרשמו ביישוב הזה.
      </p>
    );
  }
  if (miss.reason === 'point') {
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        הרחוב {miss.street} מופיע ברשימת הרחובות, אבל לא מצאנו אותו על המפה. במרשם
        העסקאות אין שם רחוב, רק מיקום, ולכן בלי מיקום של הרחוב אי אפשר לדעת אילו עסקאות
        נמצאות לידו.
      </p>
    );
  }
  const choices = miss.choices ?? [];
  if (choices.length === 0) {
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        אין רחוב בשם הזה ברשימת הרחובות של היישוב.
      </p>
    );
  }
  return (
    <div className={panelClass}>
      <h2 className="text-sm font-semibold text-slate-900">כמה רחובות מתאימים</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {choices.map((choice) => (
          <li key={choice}>
            <button
              type="button"
              onClick={() => onStreet(choice)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 transition hover:border-slate-900"
            >
              {choice}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryResult({
  history,
  year,
  onYear,
}: {
  history: MarketHistory;
  year: string;
  onYear: (year: string) => void;
}) {
  const peak = Math.max(...history.byYear.map((bar) => bar.median), 1);
  const listedYear = year === '' ? null : Number(year);

  return (
    <>
      <section className={panelClass}>
        <h2 className="text-lg font-bold text-slate-900">
          {history.street}, {history.city}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {[
            history.rooms ? `דירות ${history.rooms} חדרים` : 'כל הגדלים',
            `חציון שנתי · ${history.radiusMetres} מטר מהרחוב · ${history.years} שנים`,
          ].join(' · ')}
        </p>

        {history.asking && history.asking.count > 0 && (
          <p className="mt-3 text-sm text-slate-700">
            מודעות שמוצגות עכשיו ברחוב:{' '}
            {history.asking.count === 1 ? 'מודעה אחת' : `${history.asking.count.toLocaleString('he-IL')} מודעות`}
            , חציון {formatShekel(history.asking.median)}
            {history.asking.perSqm !== null ? ` · ${formatShekel(history.asking.perSqm)} למ"ר` : ''}. זה מחיר
            מבוקש, לא מחיר עסקה.
          </p>
        )}

        {history.byYear.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-1.5">
            <li>
              <button
                type="button"
                aria-pressed={listedYear === null}
                onClick={() => onYear('')}
                className={`rounded-lg px-2 py-1 text-sm ${
                  listedYear === null ? 'bg-slate-900 font-medium text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                כל השנים ·{' '}
                {history.total === 1 ? 'עסקה אחת' : `${history.total.toLocaleString('he-IL')} עסקאות`}
              </button>
            </li>
            {history.byYear.map((bar) => (
              <li key={bar.year} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5">
                <button
                  type="button"
                  aria-pressed={listedYear === bar.year}
                  onClick={() => onYear(String(bar.year))}
                  className={`rounded-lg px-2 py-1 text-start text-sm ${
                    listedYear === bar.year
                      ? 'bg-blue-700 font-semibold text-white'
                      : 'font-medium text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {bar.year}
                </button>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.max(8, Math.round((bar.median / peak) * 100))}%` }}
                  />
                </span>
                <span className="col-start-2 text-sm text-slate-800">
                  {formatShekel(bar.median)}
                  <span className="ms-2 text-xs text-slate-500">
                    {bar.count === 1 ? 'עסקה אחת' : `${bar.count.toLocaleString('he-IL')} עסקאות`}
                    {bar.perSqm !== null ? ` · ${formatShekel(bar.perSqm)} למ"ר` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            לא נמצאו עסקאות מגורים שנרשמו בטווח {history.radiusMetres} מטר מהרחוב ב־{history.years} השנים
            האחרונות.
          </p>
        )}

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          למרשם אין שם רחוב, אז אלה עסקאות בטווח {history.radiusMetres} מטר, לא רק בבניינים שעל הרחוב. עסקה
          מופיעה כשלושה חודשים אחרי החתימה. זו אינדיקציה, לא שמאות מקרקעין.
          {history.truncated && history.cappedAt
            ? ` המדגם חתוך ל־${history.cappedAt.toLocaleString('he-IL')} העסקאות האחרונות.`
            : ''}
        </p>
        <p className="mt-2 text-sm">
          <Link to="/valuation" className="font-medium text-blue-800 underline-offset-2 hover:underline">
            להערכת שווי לדירה
          </Link>
        </p>
      </section>

      {history.sales.length > 0 && (
        <section className={panelClass}>
          <h2 className="text-sm font-semibold text-slate-900">
            {listedYear === null ? 'עסקאות אחרונות' : `עסקאות ${listedYear}`}
          </h2>
          {history.salesTotal > history.sales.length && (
            <p className="mt-1 text-xs text-slate-500">
              מוצגות {history.sales.length.toLocaleString('he-IL')} מתוך{' '}
              {history.salesTotal.toLocaleString('he-IL')}.
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">
                עסקאות מגורים שנרשמו ליד {history.street}, {history.city}
              </caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    תאריך
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    חדרים
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    שטח
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    מחיר
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    למ"ר
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.sales.map((sale, index) => (
                  <tr key={`${sale.date}-${sale.amount}-${sale.area ?? 0}-${index}`} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-start text-slate-800">
                      {formatDate(sale.date)}
                      {sale.nature && <span className="mt-0.5 block text-xs text-slate-500">{sale.nature}</span>}
                    </td>
                    <td className="px-3 py-2 text-start tabular-nums">{sale.rooms === null ? '—' : sale.rooms}</td>
                    <td className="px-3 py-2 text-start tabular-nums">{sale.area === null ? '—' : `${sale.area} מ"ר`}</td>
                    <td className="px-3 py-2 text-start font-medium tabular-nums">{formatShekel(sale.amount)}</td>
                    <td className="px-3 py-2 text-start tabular-nums text-slate-600">
                      {sale.perSqm === null ? '—' : formatShekel(sale.perSqm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
