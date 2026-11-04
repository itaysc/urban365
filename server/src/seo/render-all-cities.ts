import type { CityEntry } from './city-page.service.js';
import { esc } from './html.js';
import { breadcrumbs, page } from './layout.js';
import { cityHref } from './render-index.js';

/**
 * Every city, by district, as plain links.
 *
 * The index shows a handful of cards per district; this is the rest. Names rather than
 * cards, because nobody scans 270 photographs for the town they came for, and a column
 * of names in alphabetical order is how a person finds one — the same way a printed
 * directory does it.
 */
export function renderAllCitiesPage(
  groups: { name: string | null; cities: CityEntry[] }[],
  appUrl: string,
  links = '',
): string {
  const canonical = `${appUrl}/nadlan/cities`;
  const trail = breadcrumbs(
    [
      { name: 'ערים', href: '/nadlan' },
      { name: 'כל הערים', href: '/nadlan/cities' },
    ],
    canonical,
  );

  const sections = groups
    .map(
      (group) => `<h2>${esc(group.name ?? 'ערים נוספות')}</h2>
<ul class="citylist">${group.cities
        .map((entry) => `<li><a href="${esc(cityHref(entry))}">${esc(entry.city)}</a></li>`)
        .join('')}</ul>`,
    )
    .join('');

  const body = `${trail.html}
<h1>כל הערים</h1>
<p class="lede">${esc('כל הערים והיישובים, לפי אזור. לכל עיר עם נכסים מוצעים יש דף עם מחירים ופילוח; בערים האחרות הקישור מוביל לחיפוש, שם אפשר לשמור התראה.')}</p>
${sections}`;

  return page({
    title: 'כל הערים — נדל״ן לפי עיר | Urban365',
    description: 'רשימת כל הערים והיישובים בישראל לפי אזור, עם קישור למחירי הנדל״ן ולנכסים המוצעים בכל אחת.',
    canonical,
    indexable: true,
    onCityPages: true,
    links,
    structuredData: [trail.data],
    appUrl,
    body,
  });
}
