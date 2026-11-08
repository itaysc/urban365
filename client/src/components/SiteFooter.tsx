import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { qk } from '@/queries/keys';
import { fetchCityLinks, type CityLink } from '@/services/search';

/** As many as the landing pages show, so the two footers say the same thing. */
const PER_COLUMN = 12;

type Section = 'forsale' | 'rent' | 'commercial';

const TITLE: Record<Section, string> = {
  forsale: 'דירות למכירה',
  rent: 'דירות להשכרה',
  commercial: 'נדל״ן מסחרי',
};

/** The busiest cities for one section. */
const busiest = (cities: CityLink[], section: Section) =>
  cities
    .filter((c) => c.counts[section] > 0)
    .sort((a, b) => b.counts[section] - a.counts[section])
    .slice(0, PER_COLUMN);

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-bold text-slate-900">{title}</h2>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

const linkClass = 'text-[0.8125rem] leading-snug text-slate-500 transition hover:text-blue-700 hover:underline';

/**
 * The map of the site, across the bottom of every public page.
 *
 * The same five columns the landing pages carry, from the same directory, for the same
 * reason: a page is worth indexing roughly in proportion to what links to it, and the
 * home page is the strongest page on the site to be linked from.
 *
 * The city links are plain anchors rather than react-router Links, because the pages
 * they point at are rendered by the API and are not in this bundle's route table — a
 * Link would try to resolve them here and find nothing.
 *
 * Nothing renders until the cities arrive. A footer that appears a second late is
 * ordinary; a footer that appears empty and then fills is a layout that jumps.
 */
export function SiteFooter() {
  const { data: cities } = useQuery({
    queryKey: qk.cities,
    queryFn: fetchCityLinks,
    // The answer changes when a scrape run finds a city we had nothing in, which is
    // not something a visitor needs within the minute.
    staleTime: 10 * 60_000,
  });

  const sections: Section[] = ['forsale', 'rent', 'commercial'];

  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
        <nav
          aria-label="מפת האתר"
          className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] sm:gap-6"
        >
          {cities &&
            sections.map((section) => {
              const top = busiest(cities, section);
              // A column of two is not a column; those cities are still in the index.
              if (top.length < 3) return null;

              return (
                <Column key={section} title={TITLE[section]}>
                  {top.map((entry) => (
                    <li key={entry.city}>
                      <a
                        className={linkClass}
                        href={`/nadlan/${section}/${encodeURIComponent(entry.slug)}`}
                      >
                        {TITLE[section]} ב{entry.city}
                      </a>
                    </li>
                  ))}
                </Column>
              );
            })}

          <Column title="חיפוש">
            <li>
              <Link className={linkClass} to="/search?section=forsale">
                דירות למכירה בכל הארץ
              </Link>
            </li>
            <li>
              <Link className={linkClass} to="/search?section=rent">
                דירות להשכרה בכל הארץ
              </Link>
            </li>
            <li>
              <Link className={linkClass} to="/search?section=commercial">
                נדל״ן מסחרי
              </Link>
            </li>
            <li>
              <Link className={linkClass} to="/agencies">
                סוכנויות נדל״ן
              </Link>
            </li>
            <li>
              <a className={linkClass} href="/nadlan">
                מחירים לפי עיר
              </a>
            </li>
            <li>
              <a className={linkClass} href="/blog">
                בלוג
              </a>
            </li>
            <li>
              <Link className={linkClass} to="/mortgage">
                מחשבון משכנתא
              </Link>
            </li>
            <li>
              <Link className={linkClass} to="/valuation">
                הערכת שווי
              </Link>
            </li>
            <li>
              <Link className={linkClass} to="/sell/new">
                פרסום נכס
              </Link>
            </li>
          </Column>

          <Column title="מידע">
            <li>
              <Link className={linkClass} to="/terms">
                תנאי שימוש
              </Link>
            </li>
            <li>
              <Link className={linkClass} to="/policy">
                מדיניות פרטיות
              </Link>
            </li>
            <li>
              <Link className={linkClass} to="/accessibility">
                הצהרת נגישות
              </Link>
            </li>
          </Column>
        </nav>

        {/*
          Two separate claims, and they are not the same one. The listing figures on
          the site are asking prices and are not a valuation of anything. The
          valuation tool is a valuation — an indicative one, from recorded sales —
          and what it is not is a שמאות מקרקעין, which is a licensed opinion that
          banks and courts accept and this is not.
        */}
        <p className="mt-6 border-t border-slate-100 pt-4 text-[0.8125rem] text-slate-500">
          הנתונים מתבססים על המודעות המתפרסמות באתר ומשתנים עם השוק, ואינם ייעוץ.{' '}
          <Link className={linkClass} to="/valuation">
            הערכת השווי
          </Link>{' '}
          היא אינדיקטיבית, מבוססת על עסקאות שנרשמו, ואינה תחליף לשמאות מקרקעין.
        </p>
      </div>
    </footer>
  );
}
