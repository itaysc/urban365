import type { Section } from '../yad2/yad2.types.js';
import type { CityEntry } from './city-page.service.js';
import { toSlug } from './city-slug.js';
import { esc, number, properties } from './html.js';
import { breadcrumbs, page } from './layout.js';

/** Which page a city's name should lead to: wherever it has the most to show. */
export function mainSection(entry: CityEntry): Section {
  const { forsale, rent, commercial } = entry.counts;
  if (forsale >= rent && forsale >= commercial) return 'forsale';
  return rent >= commercial ? 'rent' : 'commercial';
}

const href = (section: Section, city: string) =>
  `/nadlan/${section}/${encodeURIComponent(toSlug(city))}`;

const totalIn = (entry: CityEntry) =>
  entry.counts.forsale + entry.counts.rent + entry.counts.commercial;

/**
 * The index of every city with listings, grouped by district.
 *
 * This is the page that makes the others findable. A search engine reaches a city page
 * one of two ways — from a sitemap, which it is free to ignore, or from a link on a
 * page it already trusts. The site's own footer links here, and everything else hangs
 * off it, so no city page is more than two clicks from the home page.
 */
export function renderIndexPage(
  groups: { name: string | null; cities: CityEntry[] }[],
  appUrl: string,
): string {
  const canonical = `${appUrl}/nadlan`;
  const cities = groups.reduce((sum, group) => sum + group.cities.length, 0);
  const listings = groups.reduce(
    (sum, group) => sum + group.cities.reduce((n, city) => n + totalIn(city), 0),
    0,
  );

  const trail = breadcrumbs([{ name: 'ערים', href: '/nadlan' }], canonical);

  const sections = groups
    .map(
      (group) => `<h2>${esc(group.name ?? 'ערים נוספות')}</h2>
<ul class="chips">${group.cities
        .map(
          (entry) =>
            `<li><a href="${esc(href(mainSection(entry), entry.city))}">${esc(entry.city)} <span class="note">(${esc(
              number(totalIn(entry)),
            )})</span></a></li>`,
        )
        .join('')}</ul>`,
    )
    .join('');

  const body = `${trail.html}
<h1>נדל״ן בישראל לפי עיר</h1>
<p class="lede">${esc(
    `${properties(listings)} ב-${number(cities)} ערים. לכל עיר דף עם מחיר חציוני, מחיר למ״ר, ופילוח לפי מספר חדרים, שכונה וסוג נכס — מחושב מהמודעות המתפרסמות כרגע.`,
  )}</p>
${sections}`;

  return page({
    title: 'נדל״ן בישראל לפי עיר — מחירים ונכסים | Urban365',
    description: `מחירי נדל״ן ב-${number(cities)} ערים בישראל: מחיר חציוני, מחיר למ״ר ופילוח לפי חדרים ושכונות, מתוך ${number(listings)} נכסים שמוצעים כרגע.`,
    canonical,
    indexable: true,
    onCityPages: true,
    structuredData: [trail.data],
    appUrl,
    body,
  });
}
