import type { CityEntry } from './city-page.service.js';
import { esc, number } from './html.js';
import { page } from './layout.js';
import { cityHref, totalIn } from './render-index.js';

/** The same photograph the app's home uses, credited on `/nadlan/credits`. */
const COVER =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e0/Tel_Aviv_Skyline_01.jpg/1920px-Tel_Aviv_Skyline_01.jpg';

/** Per column, as the app's home does it, so a column stays a column. */
const PER_REGION = 10;

const SEARCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;

/**
 * The same order the app lists the districts in. A district it does not name goes last.
 */
const REGIONS = [
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

/**
 * The front door, drawn the way the app draws it.
 *
 * A photograph, the one question (where, and buying or renting), then the cities in
 * columns. There is no script here, so the three choices are radio buttons and the
 * box is a real field — submitting it opens the same search the app does.
 */
export function renderHomePage(
  groups: { name: string | null; cities: CityEntry[] }[],
  appUrl: string,
  links = '',
  /** The place box. Omitted, the form still submits; it just does not suggest. */
  script = '',
): string {
  const columns = groups
    .map((group) => ({
      name: group.name ?? 'אזורים נוספים',
      cities: [...group.cities].sort((a, b) => totalIn(b) - totalIn(a)).slice(0, PER_REGION),
    }))
    .filter((group) => group.cities.length > 0)
    .sort((a, b) => {
      const ai = REGIONS.indexOf(a.name);
      const bi = REGIONS.indexOf(b.name);
      if (ai === -1 && bi === -1) return b.cities.length - a.cities.length;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  const sections = columns
    .map(
      (group) => `<section class="region">
<h3><span>${esc(group.name)}</span><span class="count">${esc(String(group.cities.length))} ערים</span></h3>
<ul>${group.cities
        .map((entry) => {
          const count = totalIn(entry);
          return `<li><a href="${esc(cityHref(entry))}"><span>${esc(entry.city)}</span><span class="n">${count > 0 ? esc(number(count)) : ''}</span></a></li>`;
        })
        .join('')}</ul>
</section>`,
    )
    .join('');

  const body = `<section class="hero">
<img class="cover" src="${esc(COVER)}" alt="" width="1920" height="1080">
<div class="veil" aria-hidden="true"></div>
<div class="hero-inner">
<div>
<h1>דירות למכירה ולהשכרה בישראל</h1>
<p class="tag">כל הנכסים מהסוכנויות ומבעלי הבתים, במקום אחד.</p>
</div>
<form class="find" id="u365-find" action="/search" method="get">
<div class="tabs">
<label class="tab"><input type="radio" name="section" value="forsale" checked> מכירה</label>
<label class="tab"><input type="radio" name="section" value="rent"> השכרה</label>
<label class="tab"><input type="radio" name="section" value="commercial"> מסחרי</label>
</div>
<div class="pill">
<div class="pill-field">
<input id="u365-q" name="city" placeholder="עיר, שכונה או רחוב" aria-label="עיר, שכונה או רחוב" role="combobox" aria-expanded="false" aria-controls="u365-list" aria-autocomplete="list" autocomplete="off">
</div>
<button type="submit" aria-label="חיפוש">${SEARCH}</button>
</div>
<div class="suggest" id="u365-list" hidden></div>
</form>
<p class="budget">לא בטוחים מה התקציב? <a href="/mortgage">מחשבון המשכנתא</a> מחשב איזו דירה אפשר לקנות ומה יהיה ההחזר החודשי.</p>
</div>
</section>
<div class="door-body">
<h2>נדל״ן לפי עיר</h2>
<p class="intro">לכל עיר דף עם מחירים, פילוח לפי חדרים ושכונות, והנכסים שמוצעים בה כרגע.</p>
<div class="regions">${sections}</div>
<p class="more"><a href="/nadlan">כל הערים ומחירי הנדל״ן בהן ←</a> <a href="/agencies">סוכנויות נדל״ן ←</a></p>
<p class="credit">תמונות הערים ותמונת השער מוויקיפדיה ומוויקישיתוף. <a href="/nadlan/credits">קרדיט לצלמים</a></p>
</div>`;

  return page({
    title: 'נדל״ן למכירה ולהשכרה בישראל | Urban365',
    description:
      'דירות ונכסים מסחריים למכירה ולהשכרה בישראל, מהסוכנויות ומבעלי הבתים. לכל עיר דף עם מחירים והנכסים שמוצעים בה כרגע.',
    canonical: `${appUrl}/`,
    indexable: true,
    door: true,
    extraScript: script,
    links,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Urban365',
        url: `${appUrl}/`,
        inLanguage: 'he-IL',
        description: 'דירות ונכסים מסחריים למכירה ולהשכרה בישראל, מהסוכנויות ומבעלי הבתים.',
      },
    ],
    appUrl,
    body,
  });
}
