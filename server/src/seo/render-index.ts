import type { Section } from '../yad2/yad2.types.js';
import type { CityEntry } from './city-page.service.js';
import { toSlug } from './city-slug.js';
import { esc, number, properties } from './html.js';
import { CITY_PHOTOS } from './city-photos.js';
import { tileGradient } from './tile.js';
import { cityKey } from '../listings/city-name.js';
import { breadcrumbs, page } from './layout.js';

/** Which page a city's name should lead to: wherever it has the most to show. */
export function mainSection(entry: CityEntry): Section {
  const { forsale, rent, commercial } = entry.counts;
  if (forsale >= rent && forsale >= commercial) return 'forsale';
  return rent >= commercial ? 'rent' : 'commercial';
}

export const totalIn = (entry: CityEntry) =>
  entry.counts.forsale + entry.counts.rent + entry.counts.commercial;

/**
 * Where a city's link leads. A city with nothing on offer has no page — that URL is a
 * 404 — so it opens the app's search for it instead, where an alert can still be saved.
 */
export const cityHref = (entry: CityEntry) =>
  totalIn(entry) > 0
    ? `/nadlan/${mainSection(entry)}/${encodeURIComponent(toSlug(entry.city))}`
    : `/forsale/${encodeURIComponent(entry.city)}`;

/**
 * The picture on a city's card.
 *
 * A photograph of the city itself where Wikipedia has one — a view over the town, its
 * park, its old quarter — and a tinted tile where it does not. The first attempt used
 * a photograph from a listing in that city instead, which put somebody's kitchen under
 * the name of a town and, twice, an estate agent's advertising banner.
 */
function photo(entry: CityEntry): string {
  const picture = CITY_PHOTOS[cityKey(entry.city)];

  if (!picture) {
    return `<span class="blank" aria-hidden="true" style="background:${esc(tileGradient(entry.city))}"></span>`;
  }

  // `alt` is empty on purpose: the card's own text names the city, and a screen reader
  // reading the photograph's caption as well would say it twice.
  return `<img src="${esc(picture.url)}" alt="" loading="lazy" width="320" height="200">`;
}

/** What a card says under the city's name: how much of what is on offer there. */
function offered(entry: CityEntry): string {
  const parts = [
    entry.counts.forsale > 0 ? `${number(entry.counts.forsale)} למכירה` : null,
    entry.counts.rent > 0 ? `${number(entry.counts.rent)} להשכרה` : null,
    entry.counts.commercial > 0 ? `${number(entry.counts.commercial)} מסחרי` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : 'אין נכסים כרגע';
}

/**
 * One district's cities, as cards.
 *
 * The photograph is the cover of a property in that city rather than a picture of the
 * city itself — see the note on `CityEntry.coverImageUrl`. It is decoration, so its
 * `alt` is empty and the link's own text carries the meaning; a screen reader hears
 * the city and what is on offer, which is the whole card.
 *
 * A city with no photograph gets a tinted tile rather than a grey hole, so a grid with
 * one of them in it still reads as a grid.
 */
function grid(cities: CityEntry[]): string {
  return `<ul class="cities">${cities
    .map(
      (entry) => `<li>
<a href="${esc(cityHref(entry))}">
${photo(entry)}
<span class="shade" aria-hidden="true"></span>
<span class="label">
<span class="city">${esc(entry.city)}</span>
<span class="offered">${esc(offered(entry))}</span>
</span>
</a>
</li>`,
    )
    .join('')}</ul>`;
}

/**
 * The index: each district's biggest cities as cards, and a link to all of them.
 *
 * This is the page that makes the others findable. A search engine reaches a city page
 * one of two ways — from a sitemap, which it is free to ignore, or from a link on a
 * page it already trusts. The site's own footer links here, and everything else hangs
 * off it or off the full list, so no city page is more than three clicks from home.
 *
 * `totals` is passed in rather than summed from `groups`, which hold only the cities
 * shown — the headline describes everything we have, not what fits on the page.
 */
export function renderIndexPage(
  groups: { name: string | null; cities: CityEntry[] }[],
  totals: { cities: number; listings: number },
  appUrl: string,
  links = '',
): string {
  const canonical = `${appUrl}/nadlan`;
  const { cities, listings } = totals;

  const trail = breadcrumbs([{ name: 'ערים', href: '/nadlan' }], canonical);

  const sections = groups
    .map((group) => `<h2>${esc(group.name ?? 'ערים נוספות')}</h2>${grid(group.cities)}`)
    .join('');

  const body = `${trail.html}
<h1>נדל״ן בישראל לפי עיר</h1>
<p class="lede">${esc(
    `${properties(listings)} ב-${number(cities)} ערים. לכל עיר דף עם מחיר חציוני, מחיר למ״ר, ופילוח לפי מספר חדרים, שכונה וסוג נכס — מחושב מהמודעות המתפרסמות כרגע.`,
  )}</p>
${sections}

<p><a class="cta" href="/nadlan/cities">${esc('לרשימת כל הערים')}</a></p>

<!--
  A line and a link, rather than thirty names crushed under the grid.
  Creative Commons asks for credit in a manner reasonable to the medium, and its own
  guidance on attribution says to consider publishing a page of it — which is what
  /nadlan/credits is. Leaving it out, or burying it in metadata, is the thing the
  licence does not allow; moving it somewhere it can be read properly is encouraged.
-->
<p class="note">${esc('צילומי הערים מוויקיפדיה ומוויקישיתוף, ברישיונות Creative Commons או כנחלת הכלל.')} <a href="/nadlan/credits">${esc('קרדיט מלא לצלמים')}</a></p>`;

  return page({
    title: 'נדל״ן בישראל לפי עיר — מחירים ונכסים | Urban365',
    description: `מחירי נדל״ן ב-${number(cities)} ערים בישראל: מחיר חציוני, מחיר למ״ר ופילוח לפי חדרים ושכונות, מתוך ${number(listings)} נכסים שמוצעים כרגע.`,
    canonical,
    indexable: true,
    onCityPages: true,
    links,
    structuredData: [trail.data],
    appUrl,
    body,
  });
}
