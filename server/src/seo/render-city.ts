import type { Section } from '../yad2/yad2.types.js';
import type { Band, Summary } from './stats.js';
import type { CityListing, CityPage } from './city-page.service.js';
import { toSlug } from './city-slug.js';
import { badgesFor } from './badges.js';
import { listingPath } from './listing-slug.js';
import { addressLine, esc, hebrewDate, number, price, priceWords, properties } from './html.js';
import { breadcrumbs, page } from './layout.js';

/**
 * How each section is spoken about.
 *
 * Rent is not sale with smaller numbers: a rent figure is monthly and has to say so
 * every time it appears, or the page reads as the bargain of the century.
 */
interface Voice {
  /** "נכסים למכירה" — what the things on this page are, as a noun phrase. */
  noun: string;
  /** "נדל״ן למכירה" — how the page titles itself. */
  heading: string;
  /** How the opening sentence says it: "מוצעים כרגע למכירה ב<city>". */
  offered: string;
  /** The shortest form, for a sentence that has already said "נכסים": "למכירה". */
  suffix: string;
  /** Rent is monthly, and every figure on the page has to say so. */
  perMonth: boolean;
  sqmLabel: string;
}

const VOICE: Record<Section, Voice> = {
  forsale: {
    noun: 'נכסים למכירה',
    heading: 'נדל״ן למכירה',
    offered: 'מוצעים כרגע למכירה',
    suffix: 'למכירה',
    perMonth: false,
    sqmLabel: 'מחיר למ״ר',
  },
  rent: {
    noun: 'נכסים להשכרה',
    heading: 'נדל״ן להשכרה',
    offered: 'מוצעים כרגע להשכרה',
    suffix: 'להשכרה',
    perMonth: true,
    sqmLabel: 'שכר דירה למ״ר',
  },
  commercial: {
    noun: 'נכסים מסחריים',
    heading: 'נדל״ן מסחרי',
    offered: 'מסחריים מוצעים כרגע',
    suffix: 'מסחריים',
    perMonth: false,
    sqmLabel: 'מחיר למ״ר',
  },
};

/**
 * Below this many listings a city page is not published to the index.
 *
 * Six is where a median starts to describe a market rather than a coincidence. The page
 * is still built and still served — somebody following a link to a quiet town should
 * find what we have, and the links on it are still worth crawling — but it carries
 * `noindex` and stays out of the sitemap, because a thousand near-empty pages is the
 * definition of the doorway pattern search engines demote whole sites for.
 */
export const MIN_INDEXABLE = 6;

/**
 * `['א','ב','ג']` → `א, ב וג`, which is how a Hebrew sentence ends a list.
 *
 * The vav attaches to the word with no hyphen. `ו-לפי` is what you get from treating
 * Hebrew like English, and it reads as a typo; the hyphen belongs only before a numeral
 * or a Latin word, where the letter would otherwise run into a digit.
 */
function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';

  const last = parts[parts.length - 1];
  const joiner = /^[\u0590-\u05FF]/u.test(last) ? 'ו' : 'ו-';

  return `${parts.slice(0, -1).join(', ')} ${joiner}${last}`;
}

const money = (value: number | null, perMonth: boolean) =>
  value === null ? '—' : perMonth ? `${price(value)} לחודש` : price(value);

/** A link into the app itself, with the filters already applied. */
function searchUrl(appUrl: string, section: Section, city: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ section, city, ...extra });
  return `${appUrl}/search?${params}`;
}

const pageUrl = (section: Section, city: string) => `/nadlan/${section}/${encodeURIComponent(toSlug(city))}`;

/** The opening paragraph: the whole market in two sentences, with its own caveat. */
function lede(data: CityPage): string {
  const voice = VOICE[data.section];
  const { summary } = data;

  const parts = [`${properties(summary.count)} ${voice.offered} ב${data.city}.`];

  if (summary.medianPrice !== null) {
    parts.push(
      `המחיר החציוני עומד על ${money(summary.medianPrice, voice.perMonth)}` +
        (summary.meanPrice !== null
          ? `, והממוצע על ${money(summary.meanPrice, voice.perMonth)}`
          : '') +
        (summary.medianPricePerSqm !== null
          ? `. מחיר חציוני למ״ר: ${money(summary.medianPricePerSqm, voice.perMonth)}.`
          : '.'),
    );
  }

  /*
   * Only when the range actually brackets the median. In a market where most of the
   * listings sit on one price, the upper quartile *is* the median, and "half the
   * properties are priced between ₪1.68m and ₪2.15m" — where ₪2.15m is the figure in
   * the sentence before — reads as a mistake even though the arithmetic is right.
   */
  if (
    summary.typicalRange &&
    summary.medianPrice !== null &&
    summary.typicalRange.low < summary.medianPrice &&
    summary.typicalRange.high > summary.medianPrice
  ) {
    parts.push(
      `מחצית מהנכסים מתומחרים בין ${priceWords(summary.typicalRange.low)} ל-${priceWords(summary.typicalRange.high)}.`,
    );
  }

  // Said once, plainly, rather than implied. These are asking prices on live ads, not
  // transactions — a reader comparing them to a deal that closed should know that.
  parts.push('הנתונים מחושבים ממחירי המודעות המתפרסמות כרגע, ולא ממחירי עסקאות שנסגרו.');

  return parts.join(' ');
}

function figures(data: CityPage): string {
  const voice = VOICE[data.section];
  const { summary } = data;

  const items: [string, string][] = [['נכסים מוצעים', number(summary.count)]];

  if (summary.medianPrice !== null) {
    items.push(['מחיר חציוני', money(summary.medianPrice, voice.perMonth)]);
  }
  // Beside the median, never instead of it, and never alone: the gap between the two
  // is the most informative thing on the page and only exists if both are shown.
  if (summary.meanPrice !== null) {
    items.push(['מחיר ממוצע', money(summary.meanPrice, voice.perMonth)]);
  }
  if (summary.medianPricePerSqm !== null) {
    items.push([voice.sqmLabel, money(summary.medianPricePerSqm, voice.perMonth)]);
  }
  if (summary.medianSquareMeter !== null) {
    items.push(['שטח חציוני', `${number(summary.medianSquareMeter)} מ״ר`]);
  }

  return `<dl class="figures">${items
    .map(([term, value]) => `<div class="figure"><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`)
    .join('')}</dl>`;
}

/**
 * Whether a breakdown says anything the headline figures did not.
 *
 * Two rows is a comparison and always earns its place. One row usually does not: a city
 * where every listing is a `דירה` produces a "by property type" table whose single row
 * repeats the median printed at the top of the page. One row still earns its place when
 * it covers only part of the city — "קרית שרת: 4 of 13" is a fact about a
 * neighbourhood, not a restatement of the total.
 */
function worthShowing(bands: Band[], total: number): boolean {
  if (bands.length === 0) return false;
  if (bands.length > 1) return true;

  return bands[0].count < total * 0.8;
}

/**
 * What the two figures are, for the reader who has not met the distinction.
 *
 * Worth a line of the page. "Median" and "mean" are not common knowledge, the two are
 * routinely taken for each other, and the difference between them is exactly what
 * somebody deciding whether a city is within reach would be misled by. Only shown
 * where both figures are, since otherwise it explains something that is not there.
 */
function whatTheFiguresMean(summary: Summary): string {
  if (summary.medianPrice === null || summary.meanPrice === null) return '';

  return `<p class="note">החציון הוא המחיר האמצעי: מחצית מהנכסים יקרים ממנו ומחצית זולים ממנו. הממוצע מושפע מנכסים חריגים, ולכן פער גדול בין השניים מעיד שיש כאן מעט נכסים יקרים — או זולים — במיוחד.</p>`;
}

/** One breakdown as a table, each row a link into the search it describes. */
function bandTable(
  bands: Band[],
  options: {
    heading: string;
    caption: string;
    column: string;
    perMonth: boolean;
    sqmLabel: string;
    total: number;
    hrefFor: (band: Band) => string;
    labelFor?: (band: Band) => string;
  },
): string {
  if (!worthShowing(bands, options.total)) return '';

  const rows = bands
    .map(
      (band) => `<tr>
<th scope="row"><a href="${esc(options.hrefFor(band))}">${esc(
        options.labelFor ? options.labelFor(band) : band.label,
      )}</a></th>
<td class="num">${esc(number(band.count))}</td>
<td class="num">${esc(money(band.medianPrice, options.perMonth))}</td>
<td class="num muted">${esc(money(band.meanPrice, options.perMonth))}</td>
<td class="num">${esc(money(band.medianPricePerSqm, options.perMonth))}</td>
</tr>`,
    )
    .join('');

  return `<h2>${esc(options.heading)}</h2>
<div class="scroller">
<table>
<caption>${esc(options.caption)}</caption>
<thead><tr>
<th scope="col">${esc(options.column)}</th>
<th scope="col" class="num">נכסים</th>
<th scope="col" class="num">חציוני</th>
<th scope="col" class="num">ממוצע</th>
<th scope="col" class="num">${esc(options.sqmLabel)}</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</div>`;
}

function card(listing: CityListing, perMonth: boolean): string {
  const where = addressLine(listing);
  const facts = [
    listing.rooms ? `${number(listing.rooms)} חדרים` : null,
    listing.squareMeter ? `${number(listing.squareMeter)} מ״ר` : null,
    listing.floor !== null ? `קומה ${number(listing.floor)}` : null,
    listing.propertyType,
  ].filter(Boolean);

  /*
   * The property's own page, not the app.
   *
   * This is the link that makes the set crawlable: a card pointing into the app is a
   * query parameter on `/`, which to a search engine is the same page every time, so
   * every city page used to end in thirty-six links to one URL. The listing page then
   * offers the app itself, for the map, the gallery and the phone number.
   */
  const href = listingPath(listing.id, listing);
  const label = where || listing.propertyType || 'נכס';

  return `<li class="card">
${badgesFor(listing)}
${
  listing.coverImageUrl
    ? // `alt=""`: the card is a single link whose text is this same address, so a
      // repeat here is read twice and describes nothing — nobody here took the photo.
      `<img src="${esc(listing.coverImageUrl)}" alt="" loading="lazy" width="320" height="144">`
    : // The same block of space, empty. Without it the cards in a row are different
      // heights and the grid reads as broken rather than as one listing having no photo.
      '<div class="noimage" aria-hidden="true"></div>'
}
<div class="body">
<span class="price">${esc(money(listing.price, perMonth))}</span>
<a class="where" href="${esc(href)}">${esc(label)}</a>
<span class="facts">${esc(facts.join(' · '))}</span>
</div>
</li>`;
}

/** The whole city page. */
export function renderCityPage(data: CityPage, appUrl: string, links = ''): string {
  const voice = VOICE[data.section];
  const { summary } = data;
  const heading = `${voice.heading} ב${data.city}`;
  const canonical = `${appUrl}${pageUrl(data.section, data.city)}`;

  const trail = breadcrumbs(
    [
      { name: 'ערים', href: '/nadlan' },
      { name: data.city, href: pageUrl(data.section, data.city) },
    ],
    canonical,
  );

  /*
   * Which breakdowns this city actually has enough listings for. Worked out once and
   * used twice — to render the tables, and to describe them — so the snippet in a
   * search result never promises a section the page does not contain.
   */
  const shown = {
    rooms: worthShowing(data.rooms, summary.count),
    neighborhoods: worthShowing(data.neighborhoods, summary.count),
    types: worthShowing(data.types, summary.count),
  };

  const breakdowns = [
    shown.rooms ? 'לפי מספר חדרים' : null,
    shown.neighborhoods ? 'לפי שכונה' : null,
    shown.types ? 'לפי סוג נכס' : null,
  ].filter((part): part is string => part !== null);

  const described = [
    `${properties(summary.count)} ${voice.suffix} ב${data.city}.`,
    summary.medianPrice !== null
      ? `מחיר חציוני ${money(summary.medianPrice, voice.perMonth)}` +
        (summary.medianPricePerSqm !== null
          ? `, ${money(summary.medianPricePerSqm, voice.perMonth)} למ״ר.`
          : '.')
      : '',
    breakdowns.length > 0
      ? `מחירים ${list(breakdowns)}, והנכסים שמוצעים כרגע.`
      : 'הנכסים שמוצעים כרגע.',
  ]
    .filter(Boolean)
    .join(' ');

  const sections = data.otherSections.length
    ? `<ul class="chips">${data.otherSections
        .map(
          (other) =>
            `<li><a href="${esc(pageUrl(other.section, data.city))}">${esc(
              `${VOICE[other.section].heading} ב${data.city}`,
            )} (${esc(number(other.count))})</a></li>`,
        )
        .join('')}</ul>`
    : '';

  const nearby = data.district
    ? `<h2>${esc(`ערים נוספות ב${data.district.name}`)}</h2>
<ul class="chips">${data.district.cities
        .map(
          (other) =>
            `<li><a href="${esc(pageUrl(data.section, other))}">${esc(other)}</a></li>`,
        )
        .join('')}</ul>`
    : '';

  const listings = data.listings.length
    ? `<h2>${esc(`${voice.noun} ב${data.city}`)}</h2>
<p class="note">${esc(
        data.listings.length < summary.count
          ? `${number(data.listings.length)} מתוך ${number(summary.count)} הנכסים, החדשים ביותר תחילה.`
          : 'כל הנכסים שמוצעים כרגע, החדשים ביותר תחילה.',
      )}</p>
<ul class="cards">${data.listings.map((l) => card(l, voice.perMonth)).join('')}</ul>`
    : '';

  const body = `${trail.html}
<h1>${esc(heading)}</h1>
<p class="lede">${esc(lede(data))}</p>
${figures(data)}
${whatTheFiguresMean(summary)}
<a class="cta" href="${esc(searchUrl(appUrl, data.section, data.city))}">${esc(
    `לחיפוש ${voice.noun} ב${data.city}`,
  )}</a>
${sections}
${bandTable(data.rooms, {
  heading: `מחירים לפי מספר חדרים ב${data.city}`,
  caption: 'חציון לכל גודל דירה, מתוך הנכסים שמוצעים כרגע. גדלים עם פחות משלושה נכסים אינם מוצגים.',
  column: 'חדרים',
  total: summary.count,
  perMonth: voice.perMonth,
  sqmLabel: voice.sqmLabel,
  labelFor: (band) => `${band.label} חדרים`,
  hrefFor: (band) =>
    searchUrl(appUrl, data.section, data.city, { minRooms: band.label, maxRooms: band.label }),
})}
${bandTable(data.neighborhoods, {
  heading: `מחירים לפי שכונה ב${data.city}`,
  caption: 'חציון לכל שכונה, מתוך הנכסים שמוצעים כרגע.',
  column: 'שכונה',
  total: summary.count,
  perMonth: voice.perMonth,
  sqmLabel: voice.sqmLabel,
  hrefFor: (band) => searchUrl(appUrl, data.section, data.city, { neighborhood: band.label }),
})}
${bandTable(data.types, {
  heading: `מחירים לפי סוג נכס ב${data.city}`,
  caption: 'חציון לכל סוג נכס, מתוך הנכסים שמוצעים כרגע.',
  column: 'סוג נכס',
  total: summary.count,
  perMonth: voice.perMonth,
  sqmLabel: voice.sqmLabel,
  hrefFor: (band) => searchUrl(appUrl, data.section, data.city, { propertyType: band.label }),
})}
${listings}
${nearby}
<p class="note">${esc(`עודכן ב-${hebrewDate(data.updatedAt)}.`)}</p>`;

  return page({
    title: `${heading} — מחירים ונכסים | Urban365`,
    description: described,
    canonical,
    indexable: summary.count >= MIN_INDEXABLE,
    onCityPages: true,
    links,
    structuredData: [trail.data],
    appUrl,
    body,
  });
}
