import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
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
import { fetchMarketHistory, type HistorySale, type MarketHistory } from '@/services/market-history';

/** Choices for how many recorded sales one page of the table shows. Ten is the start. */
const PAGE_SIZES = [10, 20, 50] as const;

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
  const listedYear = year === '' ? null : Number(year);
  const asking = history.asking && history.asking.count > 0 ? history.asking : null;

  return (
    <>
      <section>
        <h2 className="text-lg font-bold text-slate-900">
          {history.street}, {history.city}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {[
            history.rooms ? `דירות ${history.rooms} חדרים` : 'כל הגדלים',
            `חציון שנתי · ${history.radiusMetres} מטר מהרחוב · ${history.years} שנים`,
          ].join(' · ')}
        </p>

        {asking && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex sm:items-baseline sm:justify-between sm:gap-4">
            <p className="text-sm text-amber-950">
              <span className="text-amber-800">מחיר מבוקש עכשיו </span>
              <span className="font-bold tabular-nums">{formatShekel(asking.median)}</span>
              {asking.perSqm !== null ? (
                <span className="text-amber-900"> · {formatShekel(asking.perSqm)} למ"ר</span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-amber-900 sm:mt-0">
              {asking.count === 1 ? 'מודעה אחת' : `${asking.count.toLocaleString('he-IL')} מודעות`} ברחוב. זה מחיר
              מבוקש, לא מחיר עסקה.
            </p>
          </div>
        )}

        {history.byYear.length > 0 ? (
          <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <li>
              <YearCard
                pressed={listedYear === null}
                onClick={() => onYear('')}
                label="כל השנים"
                value={dealCount(history.total)}
                hint={yearSpan(history.byYear)}
              />
            </li>
            {history.byYear.map((bar) => (
              <li key={bar.year}>
                <YearCard
                  pressed={listedYear === bar.year}
                  onClick={() => onYear(String(bar.year))}
                  label={String(bar.year)}
                  value={formatShekel(bar.median)}
                  hint={[
                    dealCount(bar.count),
                    bar.perSqm !== null ? `${formatShekel(bar.perSqm)} למ"ר` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
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
        <SalesTable
          key={`${history.city}-${history.street}-${year}-${history.rooms ?? ''}`}
          sales={history.sales}
          salesTotal={history.salesTotal}
          heading={listedYear === null ? 'עסקאות אחרונות' : `עסקאות ${listedYear}`}
          caption={`עסקאות מגורים שנרשמו ליד ${history.street}, ${history.city}`}
        />
      )}
    </>
  );
}

function YearCard({
  pressed,
  onClick,
  label,
  value,
  hint,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-full w-full flex-col rounded-xl border px-3 py-3 text-start shadow-sm transition ${
        pressed
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-900 hover:border-slate-400'
      }`}
    >
      <span className={`text-xs ${pressed ? 'text-white/70' : 'text-slate-500'}`}>{label}</span>
      <span className="mt-1 text-lg font-bold tabular-nums">{value}</span>
      <span className={`mt-1 text-xs leading-relaxed ${pressed ? 'text-white/75' : 'text-slate-500'}`}>{hint}</span>
    </button>
  );
}

type SaleSortKey = 'date' | 'amount' | 'rooms' | 'area';

interface SaleSort {
  key: SaleSortKey;
  dir: 'asc' | 'desc';
}

function SalesTable({
  sales,
  salesTotal,
  heading,
  caption,
}: {
  sales: HistorySale[];
  salesTotal: number;
  heading: string;
  caption: string;
}) {
  const [sort, setSort] = useState<SaleSort>({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);

  const ordered = [...sales].sort((a, b) => compareSales(a, b, sort));
  const pages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const start = safePage * pageSize;
  const rows = ordered.slice(start, start + pageSize);

  const choose = (key: SaleSortKey) => {
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    );
    setPage(0);
  };

  return (
    // Flat on purpose. The usual card leans back, and a long table then reads as
    // narrow at the top and wide at the bottom.
    <section className="u365-card is-flat border border-white/80 p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-slate-900">{heading}</h2>
      {salesTotal > sales.length && (
        <p className="mt-1 text-xs text-slate-500">
          מוצגות {sales.length.toLocaleString('he-IL')} מתוך {salesTotal.toLocaleString('he-IL')}.
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] table-fixed text-sm">
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[24%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <SortHeader label="תאריך" column="date" sort={sort} onSort={choose} />
              <SortHeader label="חדרים" column="rooms" sort={sort} onSort={choose} />
              <SortHeader label="שטח" column="area" sort={sort} onSort={choose} />
              <SortHeader label="מחיר" column="amount" sort={sort} onSort={choose} />
              <th scope="col" className="px-3 py-2 text-start font-medium">
                למ"ר
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((sale, index) => (
              <tr key={`${sale.date}-${sale.amount}-${sale.area ?? 0}-${start + index}`} className="border-b border-slate-100">
                <td className="px-3 py-2 text-start text-slate-800">
                  <span className="whitespace-nowrap">{formatDate(sale.date)}</span>
                  {sale.nature && <span className="mt-0.5 block text-xs text-slate-500">{sale.nature}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-start tabular-nums">{sale.rooms === null ? '—' : sale.rooms}</td>
                <td className="whitespace-nowrap px-3 py-2 text-start tabular-nums">{sale.area === null ? '—' : `${sale.area} מ"ר`}</td>
                <td className="whitespace-nowrap px-3 py-2 text-start font-medium tabular-nums">{formatShekel(sale.amount)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-start tabular-nums text-slate-600">
                  {sale.perSqm === null ? '—' : formatShekel(sale.perSqm)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SalesPager
        page={safePage}
        pages={pages}
        pageSize={pageSize}
        shown={ordered.length}
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size);
          setPage(0);
        }}
      />
    </section>
  );
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SaleSortKey;
  sort: SaleSort;
  onSort: (column: SaleSortKey) => void;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-3 py-2 text-start font-medium"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 rounded text-start ${active ? 'font-semibold text-slate-800' : 'hover:text-slate-800'}`}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? 'text-slate-700' : 'text-slate-400'}`} aria-hidden />
      </button>
    </th>
  );
}

function SalesPager({
  page,
  pages,
  pageSize,
  shown,
  onPage,
  onPageSize,
}: {
  page: number;
  pages: number;
  pageSize: number;
  shown: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const from = shown === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(shown, (page + 1) * pageSize);
  return (
    <nav aria-label="עימוד העסקאות" className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-slate-500">
          {from.toLocaleString('he-IL')}–{to.toLocaleString('he-IL')} מתוך {shown.toLocaleString('he-IL')}
        </p>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          בעמוד
          <select
            aria-label="כמה עסקאות בעמוד"
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size.toLocaleString('he-IL')}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          <PagerButton disabled={page === 0} onClick={() => onPage(page - 1)}>
            הקודם
          </PagerButton>
          {Array.from({ length: pages }, (_, index) => (
            <PagerButton key={index} current={index === page} onClick={() => onPage(index)}>
              {(index + 1).toLocaleString('he-IL')}
            </PagerButton>
          ))}
          <PagerButton disabled={page === pages - 1} onClick={() => onPage(page + 1)}>
            הבא
          </PagerButton>
        </div>
      )}
    </nav>
  );
}

function PagerButton({
  children,
  onClick,
  disabled = false,
  current = false,
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
  current?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={current ? 'page' : undefined}
      className={`rounded-lg px-2.5 py-1.5 text-sm ${
        current
          ? 'bg-slate-900 font-medium text-white'
          : 'text-slate-700 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent'
      }`}
    >
      {children}
    </button>
  );
}

function dealCount(count: number): string {
  return count === 1 ? 'עסקה אחת' : `${count.toLocaleString('he-IL')} עסקאות`;
}

/** Newest year is first. One year has no span to draw. */
function yearSpan(years: { year: number }[]): string {
  if (years.length === 0) return '';
  const newest = years[0]?.year;
  const oldest = years[years.length - 1]?.year;
  if (newest === undefined || oldest === undefined || newest === oldest) return String(newest ?? '');
  return `${oldest}–${newest}`;
}

function compareSales(a: HistorySale, b: HistorySale, sort: SaleSort): number {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const left = saleSortValue(a, sort.key);
  const right = saleSortValue(b, sort.key);
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (left < right) return -sign;
  if (left > right) return sign;
  return 0;
}

function saleSortValue(sale: HistorySale, key: SaleSortKey): string | number | null {
  if (key === 'date') return sale.date;
  if (key === 'amount') return sale.amount;
  if (key === 'rooms') return sale.rooms;
  return sale.area;
}
