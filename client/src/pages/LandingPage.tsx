import { Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HeroSearch } from '@/components/home/HeroSearch';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { qk } from '@/queries/keys';
import { fetchCityLinks, type CityLink } from '@/services/search';

/**
 * The cover.
 *
 * From Wikimedia, like the city photographs — Creative Commons, credited at the foot
 * of the page as the licence requires. Hosted there rather than copied here for now;
 * if the traffic ever justifies it, it belongs in the bucket with everything else.
 */
const COVER = {
  url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e0/Tel_Aviv_Skyline_01.jpg/1920px-Tel_Aviv_Skyline_01.jpg',
  credit: 'Ynhockey, CC BY-SA 4.0',
  page: 'https://commons.wikimedia.org/wiki/File:Tel_Aviv_Skyline_01.jpg',
};

/** Regions in the order somebody from the centre reads them. */
const ORDER = [
  'מרכז והשרון',
  'תל אביב והסביבה',
  'ירושלים והסביבה',
  'שפלה',
  'חיפה והקריות',
  'חדרה והעמקים',
  'צפון והגליל',
  'דרום',
  'יהודה ושומרון',
];

/** Per region, so a column is a column and not a page. */
const PER_REGION = 10;

const total = (c: CityLink) => c.counts.forsale + c.counts.rent + c.counts.commercial;

function byRegion(cities: CityLink[]): { name: string; cities: CityLink[] }[] {
  const groups = new Map<string, CityLink[]>();
  for (const city of cities) {
    const name = city.district ?? 'אזורים נוספים';
    groups.set(name, [...(groups.get(name) ?? []), city]);
  }

  return [...groups.entries()]
    .map(([name, list]) => ({
      name,
      cities: [...list].sort((a, b) => total(b) - total(a)).slice(0, PER_REGION),
    }))
    .sort((a, b) => {
      const ai = ORDER.indexOf(a.name);
      const bi = ORDER.indexOf(b.name);
      // Anything not in the list goes last, biggest first among themselves.
      if (ai === -1 && bi === -1) return b.cities.length - a.cities.length;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
}

/**
 * The front door.
 *
 * It used to be the results page, which meant the site opened on a grid of whatever
 * happened to be newest and a map of the whole country — a page that answers a
 * question nobody had asked yet. This asks the question instead: where, and buying or
 * renting. Everything else is one click away.
 *
 * The city columns underneath are not decoration either. They are the same links the
 * footer carries, in the place a person actually looks for them, and they are what a
 * search engine follows from the strongest page on the site.
 */
export function LandingPage() {
  const [params] = useSearchParams();
  useDocumentTitle('נדל״ן למכירה ולהשכרה בישראל');

  const { data: cities } = useQuery({ queryKey: qk.cities, queryFn: fetchCityLinks });

  /*
   * A link minted while the results page lived here still works.
   *
   * Every filtered search ever shared, every link on a city page, every bookmark —
   * all of them point at `/` with a query string. Those go on to the results page
   * rather than landing on a front door that ignores them.
   */
  if ([...params.keys()].length > 0) {
    return <Navigate to={{ pathname: '/search', search: params.toString() }} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <section className="relative isolate overflow-hidden">
        <img
          src={COVER.url}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover"
          fetchPriority="high"
        />
        {/* Dark enough for white text to pass contrast over a bright sky. */}
        <div className="absolute inset-0 -z-10 bg-slate-900/55" aria-hidden />

        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-16 text-center sm:py-24">
          <div>
            <h1 className="text-3xl font-extrabold text-white drop-shadow-sm sm:text-4xl">
              דירות למכירה ולהשכרה בישראל
            </h1>
            <p className="mt-2 text-base text-white/90 sm:text-lg">
              כל הנכסים מהסוכנויות ומבעלי הבתים, במקום אחד.
            </p>
          </div>

          <HeroSearch />
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-8">
        <h2 className="text-xl font-bold text-slate-900">נדל״ן לפי עיר</h2>
        <p className="mt-1 text-sm text-slate-500">
          לכל עיר דף עם מחירים, פילוח לפי חדרים ושכונות, והנכסים שמוצעים בה כרגע.
        </p>

        {/*
          Each row carries how many properties are in that city. A column of names
          alone is a menu; the number is the reason to pick one, and it is the only
          thing on the card that was not already in the footer.
        */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cities &&
            byRegion(cities).map((region) => (
              <section
                key={region.name}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 transition hover:border-slate-300 hover:shadow-md"
              >
                <h3 className="mb-3 flex items-baseline justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <span className="text-sm font-bold text-slate-900">{region.name}</span>
                  <span className="text-xs font-normal text-slate-400">
                    {region.cities.length} ערים
                  </span>
                </h3>

                <ul className="-mx-2 flex flex-col">
                  {region.cities.map((city) => (
                    <li key={city.city}>
                      {/*
                        A plain anchor: the city pages are rendered by the API and are
                        not in this bundle's route table. The whole row is the target,
                        not the three words in it.
                      */}
                      <a
                        className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-blue-700"
                        href={`/nadlan/forsale/${encodeURIComponent(city.slug)}`}
                      >
                        <span className="truncate">{city.city}</span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-400">
                          {total(city)}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>

        <p className="mt-5 text-sm">
          <a className="text-blue-700 hover:underline" href="/nadlan">
            כל הערים ומחירי הנדל״ן בהן ←
          </a>
        </p>

        <p className="mt-6 text-xs text-slate-400">
          תמונת השער:{' '}
          <a className="hover:underline" href={COVER.page} rel="noopener noreferrer" target="_blank">
            {COVER.credit}
          </a>
        </p>
      </div>

      <SiteFooter />
    </div>
  );
}
