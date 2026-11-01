import type { Section } from '../yad2/yad2.types.js';
import { toSlug } from './city-slug.js';
import { addressLine, esc, hebrewDate, number, price as shekels } from './html.js';
import { breadcrumbs, page } from './layout.js';
import { listingPath } from './listing-slug.js';
import type { ListingDetail, SimilarListing } from './listing-page.service.js';

/** The most photographs a page shows. Beyond this nobody scrolls and every one costs. */
const PHOTOS = 10;

/** Long enough to be a snippet, short enough that a search engine shows all of it. */
const DESCRIPTION_LIMIT = 160;

const SECTION_WORD: Record<Section, string> = {
  forsale: 'למכירה',
  rent: 'להשכרה',
  commercial: 'מסחרי',
};

const cityPath = (section: Section, city: string) =>
  `/nadlan/${section}/${encodeURIComponent(toSlug(city))}`;

const money = (value: number | null, section: Section) =>
  value === null ? '—' : section === 'rent' ? `${shekels(value)} לחודש` : shekels(value);

/**
 * Every photograph we hold, ours first.
 *
 * `images` are uploaded to our own bucket; `imageUrls` are the feed's CDN and are what
 * a scraped listing has instead. The cover goes first wherever it came from, because it
 * is the one somebody chose.
 */
function photos(listing: ListingDetail): string[] {
  const ours = listing.images.map((image) => image.url);
  const all = ours.length > 0 ? ours : listing.imageUrls;

  const ordered = listing.coverImageUrl
    ? [listing.coverImageUrl, ...all.filter((url) => url !== listing.coverImageUrl)]
    : all;

  return ordered.slice(0, PHOTOS);
}

/**
 * What this property is, in the words somebody would have typed to find it.
 *
 * Street and city, with the neighbourhood deliberately left out. This is the page title
 * as well as the heading, and a result page shows about sixty characters: on a street
 * like `שדרות מקס ואמפרו שיין` the neighbourhood is what pushes the city past the cut,
 * and the city is the word somebody searched for. The neighbourhood is still on the
 * page, in the breadcrumb and in the details.
 */
function heading(listing: ListingDetail): string {
  const what = listing.propertyType?.trim() || 'נכס';
  const size = listing.rooms ? `${number(listing.rooms)} חדרים` : null;
  const where = addressLine({ ...listing, neighborhood: null });

  return [[what, size].filter(Boolean).join(' '), where].filter(Boolean).join(' ב');
}

/** A snippet: the facts first, then as much of the seller's own words as will fit. */
function snippet(listing: ListingDetail): string {
  const facts = [
    heading(listing),
    listing.price !== null ? money(listing.price, listing.section) : null,
    listing.squareMeter ? `${number(listing.squareMeter)} מ״ר` : null,
  ]
    .filter(Boolean)
    .join('. ');

  const own = listing.description?.replace(/\s+/gu, ' ').trim() ?? '';
  const room = DESCRIPTION_LIMIT - facts.length - 2;

  /*
   * A scraped listing can arrive with a price and nothing else, and "דירה בהרצליה.
   * 5,995,000 ₪." is a snippet too short to tell anybody whether to click. Where the
   * seller gave us no words, the page says what it holds instead — which is true of
   * every one of these pages and is still more use than half a line.
   */
  if (own.length === 0 || room < 40) {
    return clamp(`${facts}. פרטי הנכס, תמונות ונכסים נוספים${listing.city ? ` ב${listing.city}` : ''}.`);
  }

  const cut = own.length <= room ? own : `${own.slice(0, own.lastIndexOf(' ', room))}…`;
  return clamp(`${facts}. ${cut}`);
}

/**
 * The last word on length.
 *
 * The arithmetic above budgets for the description, but the facts alone can already be
 * long on a street with a name — and a snippet cut off by Google mid-word is worse than
 * one we ended ourselves.
 */
function clamp(text: string): string {
  if (text.length <= DESCRIPTION_LIMIT) return text;

  const cut = text.slice(0, DESCRIPTION_LIMIT - 1);
  const space = cut.lastIndexOf(' ');

  return `${(space > DESCRIPTION_LIMIT * 0.6 ? cut.slice(0, space) : cut).replace(/[.,\s]+$/u, '')}…`;
}

/** The numbers that belong at the top, where somebody decides whether to read on. */
function figures(listing: ListingDetail): string {
  const items: [string, string][] = [];

  if (listing.rooms !== null) items.push(['חדרים', number(listing.rooms)]);
  if (listing.squareMeter !== null) items.push(['שטח', `${number(listing.squareMeter)} מ״ר`]);
  if (listing.floor !== null) {
    items.push([
      'קומה',
      listing.buildingTopFloor !== null
        ? `${number(listing.floor)} מתוך ${number(listing.buildingTopFloor)}`
        : number(listing.floor),
    ]);
  }
  if (listing.pricePerSquareMeter !== null) {
    items.push(['מחיר למ״ר', money(listing.pricePerSquareMeter, listing.section)]);
  }

  if (items.length === 0) return '';

  return `<dl class="figures">${items
    .map(([term, value]) => `<div class="figure"><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`)
    .join('')}</dl>`;
}

/** Everything else the record holds, as a table rather than as prose nobody reads. */
function details(listing: ListingDetail): string {
  const rows: [string, string][] = [];

  const add = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return;
    rows.push([label, String(value)]);
  };

  add('סוג נכס', listing.propertyType);
  add('מצב הנכס', listing.propertyCondition);
  add('שטח בנוי', listing.squareMeterBuilt ? `${number(listing.squareMeterBuilt)} מ״ר` : null);
  add('גינה', listing.squareMeterGarden ? `${number(listing.squareMeterGarden)} מ״ר` : null);
  add('מרפסות', listing.balconiesCount || null);
  add('חניות', listing.parkingSpacesCount || null);
  if (listing.isNewFromDeveloper) add('מקבלן', 'כן');
  if (listing.isExclusive) add('בלעדיות', 'כן');
  add('פורסם', listing.listedAt ? hebrewDate(listing.listedAt) : null);

  if (rows.length === 0) return '';

  return `<h2>פרטי הנכס</h2>
<table>
<tbody>${rows
    .map(([label, value]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`)
    .join('')}</tbody>
</table>`;
}

/** The seller's own words, with their line breaks kept and nothing else of theirs. */
function describedByTheSeller(text: string | null): string {
  const paragraphs = (text ?? '')
    .split(/\n{1,}/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return '';

  return `<h2>תיאור</h2>${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}`;
}

function gallery(urls: string[], alt: string): string {
  if (urls.length === 0) return '';

  return `<ul class="gallery">${urls
    .map(
      (url, i) =>
        `<li><img src="${esc(url)}" alt="${esc(`${alt} — תמונה ${i + 1}`)}"${
          // The first is what somebody sees before anything scrolls, so it is not
          // deferred; everything below the fold is.
          i === 0 ? '' : ' loading="lazy"'
        } width="640" height="420"></li>`,
    )
    .join('')}</ul>`;
}

function similarTo(similar: SimilarListing[], section: Section, city: string | null): string {
  if (similar.length === 0) return '';

  const cards = similar
    .map((other) => {
      const where = addressLine(other) || other.propertyType || 'נכס';
      const facts = [
        other.rooms ? `${number(other.rooms)} חדרים` : null,
        other.squareMeter ? `${number(other.squareMeter)} מ״ר` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      return `<li class="card">
${
  other.coverImageUrl
    ? `<img src="${esc(other.coverImageUrl)}" alt="${esc(where)}" loading="lazy" width="320" height="144">`
    : '<div class="noimage" aria-hidden="true"></div>'
}
<div class="body">
<span class="price">${esc(money(other.price, section))}</span>
<a class="where" href="${esc(listingPath(other.id, other))}">${esc(where)}</a>
<span class="facts">${esc(facts)}</span>
</div>
</li>`;
    })
    .join('');

  return `<h2>${esc(city ? `נכסים נוספים ב${city}` : 'נכסים נוספים')}</h2>
<ul class="cards">${cards}</ul>`;
}

/** What schema.org calls this kind of property, where we can say honestly. */
function residenceType(propertyType: string | null): string {
  if (!propertyType) return 'Residence';
  if (/בית|קוטג|וילה|דו משפחתי/u.test(propertyType)) return 'House';
  if (/דירה|פנטהאוז|גג|סטודיו|מרתף/u.test(propertyType)) return 'Apartment';
  return 'Residence';
}

/**
 * The listing as structured data.
 *
 * Only fields the record actually carries. A `RealEstateListing` with an invented
 * floor area is a lie told to a machine that will repeat it, and the penalty for
 * structured data that disagrees with the page is losing the rich result on every page
 * — so everything here is read from the same row the text above was.
 */
function listingJsonLd(listing: ListingDetail, canonical: string, images: string[]): unknown {
  const about: Record<string, unknown> = {
    '@type': residenceType(listing.propertyType),
    name: heading(listing),
    address: {
      '@type': 'PostalAddress',
      ...(listing.street
        ? { streetAddress: [listing.street, listing.houseNumber].filter(Boolean).join(' ') }
        : {}),
      ...(listing.neighborhood ? { addressNeighborhood: listing.neighborhood } : {}),
      ...(listing.city ? { addressLocality: listing.city } : {}),
      addressCountry: 'IL',
    },
  };

  if (listing.rooms !== null) about.numberOfRooms = listing.rooms;
  if (listing.squareMeter !== null) {
    about.floorSize = { '@type': 'QuantitativeValue', value: listing.squareMeter, unitCode: 'MTK' };
  }
  if (listing.latitude !== null && listing.longitude !== null) {
    about.geo = { '@type': 'GeoCoordinates', latitude: listing.latitude, longitude: listing.longitude };
  }

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    url: canonical,
    name: heading(listing),
    inLanguage: 'he-IL',
    about,
  };

  if (listing.description) data.description = listing.description.slice(0, 500);
  if (images.length > 0) data.image = images;
  if (listing.listedAt) data.datePosted = listing.listedAt.toISOString();

  if (listing.price !== null) {
    data.offers =
      listing.section === 'rent'
        ? {
            '@type': 'Offer',
            availability: 'https://schema.org/InStock',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: listing.price,
              priceCurrency: 'ILS',
              // Per month, which is how every rent on this site is quoted.
              unitCode: 'MON',
            },
          }
        : {
            '@type': 'Offer',
            availability: 'https://schema.org/InStock',
            price: listing.price,
            priceCurrency: 'ILS',
          };
  }

  if (listing.agency) {
    data.provider = { '@type': 'RealEstateAgent', name: listing.agency.name };
  }

  return data;
}

/**
 * One property, as a page of its own.
 *
 * The phone number is deliberately not here. The app hands one out at a time from a
 * rate-limited route behind a button, and a page written for crawlers is exactly where
 * that restraint would otherwise be undone — so this page ends at "open it in the app",
 * the same wall every other visitor meets.
 */
export function renderListingPage(
  listing: ListingDetail,
  similar: SimilarListing[],
  appUrl: string,
  links = '',
): string {
  const title = heading(listing);
  const canonical = `${appUrl}${listingPath(listing.id, listing)}`;
  const images = photos(listing);

  const trail = breadcrumbs(
    [
      { name: 'ערים', href: '/nadlan' },
      ...(listing.city
        ? [{ name: listing.city, href: cityPath(listing.section, listing.city) }]
        : []),
      // The address rather than the full heading: this is the trail a search result
      // prints under the title, and "דירה 5 חדרים ב…" repeated there is the title twice.
      { name: addressLine(listing) || title, href: listingPath(listing.id, listing) },
    ],
    canonical,
  );

  const drop =
    listing.priceBeforeDrop !== null && listing.price !== null && listing.priceBeforeDrop > listing.price
      ? `<span class="was">${esc(shekels(listing.priceBeforeDrop))}</span>`
      : '';

  const amenities =
    listing.amenities.length > 0
      ? `<h2>מה יש בנכס</h2><ul class="chips plain">${listing.amenities
          .map((label) => `<li><span>${esc(label)}</span></li>`)
          .join('')}</ul>`
      : '';

  const seller = listing.agency
    ? `<h2>מי מוכר</h2>
<p><a href="${esc(`${appUrl}/agency/${encodeURIComponent(listing.agency.id)}`)}">${esc(
        listing.agency.name,
      )}</a>${
        listing.agency.licenseNumber
          ? ` · ${esc(`רישיון תיווך ${listing.agency.licenseNumber}`)}`
          : ''
      }</p>`
    : '';

  const body = `${trail.html}
<h1>${esc(title)}</h1>
<p class="headline-price">${esc(money(listing.price, listing.section))}${drop}</p>
${figures(listing)}
<a class="cta" href="${esc(`${appUrl}/?listing=${encodeURIComponent(listing.id)}`)}">צפייה בנכס ויצירת קשר</a>
${gallery(images, title)}
${describedByTheSeller(listing.description)}
${details(listing)}
${amenities}
${seller}
${similarTo(similar, listing.section, listing.city)}
${
  listing.city
    ? `<p class="note"><a href="${esc(cityPath(listing.section, listing.city))}">${esc(
        `כל הנכסים ${SECTION_WORD[listing.section]} ב${listing.city}`,
      )}</a></p>`
    : ''
}
<p class="note">${esc(`עודכן ב-${hebrewDate(listing.lastSeenAt)}.`)}</p>`;

  return page({
    title: `${title} | Urban365`,
    description: snippet(listing),
    canonical,
    indexable: true,
    onCityPages: true,
    links,
    structuredData: [trail.data, listingJsonLd(listing, canonical, images)],
    appUrl,
    body,
  });
}

/**
 * A listing that has left the market.
 *
 * Served with 410, and written as an answer rather than an error: somebody following a
 * link from a message six weeks old wants to know what happened to that flat, and the
 * useful next thing is the others near it.
 */
export function renderGonePage(
  options: { city: string | null; section: Section; similar: SimilarListing[] },
  appUrl: string,
  links = '',
): string {
  const where = options.city ? ` ב${options.city}` : '';

  const body = `<h1>${esc(`הנכס כבר לא מוצע${where}`)}</h1>
<p class="lede">${esc(
    'המודעה הורדה — ייתכן שהנכס נמכר, הושכר או שבעליו החליטו להפסיק לפרסם. אלה נכסים אחרים שמוצעים עכשיו.',
  )}</p>
${similarTo(options.similar, options.section, options.city)}
${
  options.city
    ? `<a class="cta" href="${esc(cityPath(options.section, options.city))}">${esc(
        `כל הנכסים ${SECTION_WORD[options.section]} ב${options.city}`,
      )}</a>`
    : `<a class="cta" href="/nadlan">לרשימת הערים</a>`
}`;

  return page({
    title: `הנכס כבר לא מוצע | Urban365`,
    description: 'המודעה הורדה. אפשר לראות נכסים אחרים שמוצעים כרגע באותו אזור.',
    canonical: options.city ? `${appUrl}${cityPath(options.section, options.city)}` : `${appUrl}/nadlan`,
    indexable: false,
    onCityPages: true,
    links,
    appUrl,
    body,
  });
}

export { heading as listingHeading };
