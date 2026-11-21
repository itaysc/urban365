import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HeroSearch } from '@/components/home/HeroSearch';
import { HomeGuide } from '@/components/home/HomeGuide';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { REGIONS } from '@/data/regions';
import { qk } from '@/queries/keys';
import { fetchCityLinks, type CityLink } from '@/services/search';

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
      const ai = REGIONS.indexOf(a.name);
      const bi = REGIONS.indexOf(b.name);
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
function HeroCover() {
  const video = useRef<HTMLVideoElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    node.muted = true;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    node.addEventListener('play', onPlay);
    node.addEventListener('pause', onPause);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.pause();
      setPlaying(false);
      return () => {
        node.removeEventListener('play', onPlay);
        node.removeEventListener('pause', onPause);
      };
    }

    const move = layer.current;
    let frame = 0;
    const place = () => {
      if (!move) return;
      const shift = Math.min(window.scrollY, 480) * 0.28;
      move.style.transform = `translate3d(0, ${shift}px, 0) scale(1.08)`;
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      node.removeEventListener('play', onPlay);
      node.removeEventListener('pause', onPause);
    };
  }, []);

  const toggle = () => {
    const node = video.current;
    if (!node) return;
    if (node.paused) void node.play();
    else node.pause();
  };

  return (
    <>
      <div className="absolute inset-0 -z-10 overflow-hidden bg-slate-900">
        <div ref={layer} className="u365-hero-photo absolute inset-x-0 -top-[8%] h-[120%] w-full">
          <video
            ref={video}
            src="/home/urban1-slow.mp4"
            poster="/home/urban1-poster.jpg"
            width={1280}
            height={720}
            muted
            autoPlay
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? 'עצירת הסרטון' : 'הפעלת הסרטון'}
        className="absolute top-3 inset-inline-start-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.45)] transition hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        )}
      </button>
    </>
  );
}

export function LandingPage() {
  const [params] = useSearchParams();

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
    <div className="min-h-screen bg-[var(--paper)]">
      <SiteHeader />

      <main id="main" tabIndex={-1}>
        {/*
          No `overflow-hidden`: the suggestion dropdown hangs below the search box and
          past the foot of the hero, and hiding the overflow cut it in half. The cover
          does not need the clip — `absolute inset-0 object-cover` already fits it to
          this box exactly.
        */}
        <section className="relative isolate">
          <HeroCover />
          {/* Dark behind the words. The skyline at the edges stays visible. */}
          <div className="u365-hero-shade absolute inset-0 -z-10" aria-hidden />

          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-16 text-center sm:py-24">
            <div>
              <h1 className="text-3xl font-extrabold text-white drop-shadow-sm sm:text-4xl">
                דירות למכירה ולהשכרה בישראל
              </h1>
              <p className="mt-2 text-base text-white/90 sm:text-lg">
                דירות למכירה ולהשכרה בישראל, מהסוכנויות ומבעלי הבתים, במקום אחד.
              </p>
            </div>

            <HeroSearch />

            {/*
              The second question every buyer has, under the first one. A calculator
              reachable only from the footer is a calculator nobody opens, and the
              budget it produces is what turns the box above into a useful search
              rather than a guess at a round number.
            */}
            {/*
              Heavier and less transparent than the body text it sits beside: this line
              is white on a photograph, where 400 at 80% opacity thins out against the
              lighter parts of the image. The link inside it stays a step above at 600.
            */}
            <p className="text-sm font-medium text-white/90">
              לא בטוחים מה התקציב?{' '}
              <Link
                to="/mortgage"
                className="font-semibold text-white underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
              >
                מחשבון המשכנתא
              </Link>{' '}
              מחשב איזו דירה אפשר לקנות ומה יהיה ההחזר החודשי.
            </p>
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
                  className="u365-card border border-white/80 p-5"
                >
                  <h3 className="mb-3 flex items-baseline justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <span className="text-sm font-bold text-slate-900">{region.name}</span>
                    <span className="text-xs font-normal text-slate-500">
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
                          <span className="sr-only">
                            דירות למכירה ב{city.city}
                            {total(city) > 0 ? `, ${total(city)} נכסים` : ''}
                          </span>
                          <span className="truncate" aria-hidden="true">
                            {city.city}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-slate-500" aria-hidden="true">
                            {total(city)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>

          <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a className="text-blue-700 hover:underline" href="/nadlan">
              כל הערים ומחירי הנדל״ן בהן ←
            </a>
            <Link className="text-blue-700 hover:underline" to="/agencies">
              סוכנויות נדל״ן ←
            </Link>
          </p>

          <HomeGuide />

          <p className="mt-6 text-xs text-slate-500">
            תמונות הערים מוויקיפדיה ומוויקישיתוף.{' '}
            <a className="hover:underline" href="/nadlan/credits">
              קרדיט לצלמים
            </a>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
