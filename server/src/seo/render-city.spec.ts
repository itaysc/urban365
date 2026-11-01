import { describe, expect, it } from 'vitest';
import type { CityPage } from './city-page.service.js';
import { toSlug } from './city-slug.js';
import { MIN_INDEXABLE, renderCityPage } from './render-city.js';
import { byNeighborhood, byPropertyType, byRooms, summarise, type StatRow } from './stats.js';

const APP = 'https://urban365.example';

const stat = (over: Partial<StatRow> = {}): StatRow => ({
  price: 2_000_000,
  squareMeter: 100,
  pricePerSquareMeter: null,
  rooms: 4,
  propertyType: 'דירה',
  neighborhood: 'קרית שרת',
  ...over,
});

function build(rows: StatRow[], over: Partial<CityPage> = {}): CityPage {
  return {
    city: 'חולון',
    section: 'forsale',
    summary: summarise(rows),
    rooms: byRooms(rows),
    types: byPropertyType(rows),
    neighborhoods: byNeighborhood(rows),
    listings: [],
    otherSections: [],
    district: null,
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...over,
  };
}

/** Enough listings to clear the indexing threshold, in a spread of sizes. */
const healthy = () => [
  ...Array.from({ length: 4 }, () => stat({ rooms: 3, price: 1_600_000 })),
  ...Array.from({ length: 4 }, () => stat({ rooms: 4, price: 2_200_000 })),
];

describe('renderCityPage', () => {
  it('says what the page is, in the title and in the heading', () => {
    const html = renderCityPage(build(healthy()), APP);

    expect(html).toContain('<title>נדל״ן למכירה בחולון — מחירים ונכסים | Urban365</title>');
    expect(html).toContain('<h1>נדל״ן למכירה בחולון</h1>');
  });

  it('points its canonical at the public site, not at whatever served it', () => {
    // These pages are rendered by the API and proxied onto the main domain. A canonical
    // naming the API origin would hand the ranking to a hostname nobody should visit.
    const html = renderCityPage(build(healthy()), APP);

    expect(html).toContain(
      `<link rel="canonical" href="${APP}/nadlan/forsale/${encodeURIComponent('חולון')}">`,
    );
  });

  it('asks to be indexed once there are enough listings to describe a market', () => {
    const rows = Array.from({ length: MIN_INDEXABLE }, () => stat());

    expect(renderCityPage(build(rows), APP)).toContain('content="index,follow"');
  });

  it('keeps a thin page out of the index while leaving its links worth following', () => {
    const rows = Array.from({ length: MIN_INDEXABLE - 1 }, () => stat());

    expect(renderCityPage(build(rows), APP)).toContain('content="noindex,follow"');
  });

  it('says every rent figure is monthly', () => {
    const rows = Array.from({ length: 6 }, () => stat({ price: 5_200, squareMeter: 60 }));
    const html = renderCityPage(build(rows, { section: 'rent' }), APP);

    expect(html).toContain('5,200 ₪ לחודש');
    expect(html).not.toMatch(/5,200 ₪(?! לחודש)/u);
  });

  it('breaks the market down by rooms, with a link to each size', () => {
    const html = renderCityPage(build(healthy()), APP);

    expect(html).toContain('מחירים לפי מספר חדרים בחולון');
    expect(html).toContain('minRooms=3&amp;maxRooms=3');
    expect(html).toContain('1,600,000 ₪');
  });

  it('leaves out a breakdown that only repeats the headline', () => {
    // Every listing is a דירה, so a "by property type" table is the same median twice.
    const html = renderCityPage(build(healthy()), APP);

    expect(html).not.toContain('מחירים לפי סוג נכס');
  });

  it('describes only the breakdowns it actually shows', () => {
    const html = renderCityPage(build(healthy()), APP);
    const description = /name="description" content="([^"]+)"/u.exec(html)?.[1] ?? '';

    expect(description).toContain('לפי מספר חדרים');
    expect(description).not.toContain('לפי סוג נכס');
  });

  it('escapes a city name rather than trusting the feed it came from', () => {
    const html = renderCityPage(build(healthy(), { city: '<img src=x onerror=alert(1)>' }), APP);

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes a neighbourhood name inside the link it builds from it', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      stat({ neighborhood: i < 3 ? 'א" onmouseover="x' : 'נווה רמז' }),
    );
    const html = renderCityPage(build(rows), APP);

    expect(html).not.toContain('onmouseover="x"');
    expect(html).not.toMatch(/href="[^"]*"\s+onmouseover/u);
  });

  it('links to the same city in the other section', () => {
    const html = renderCityPage(build(healthy(), { otherSections: [{ section: 'rent', count: 4 }] }), APP);

    expect(html).toContain(`/nadlan/rent/${encodeURIComponent('חולון')}`);
    expect(html).toContain('נדל״ן להשכרה בחולון (4)');
  });

  it('links on to the rest of the district', () => {
    const html = renderCityPage(
      build(healthy(), { district: { name: 'תל אביב והסביבה', cities: ['בת ים', 'רמת גן'] } }),
      APP,
    );

    expect(html).toContain('ערים נוספות בתל אביב והסביבה');
    // A two-word city is hyphenated into one slug before it is encoded.
    expect(html).toContain(`/nadlan/forsale/${encodeURIComponent(toSlug('בת ים'))}`);
  });

  it('carries a breadcrumb trail as structured data', () => {
    const html = renderCityPage(build(healthy()), APP);
    const block = /<script type="application\/ld\+json">(.+?)<\/script>/u.exec(html)?.[1] ?? '';
    const data = JSON.parse(block) as { '@type': string; itemListElement: { name: string }[] };

    expect(data['@type']).toBe('BreadcrumbList');
    expect(data.itemListElement.map((i) => i.name)).toEqual(['ערים', 'חולון']);
  });

  it('runs no JavaScript of its own, which is the point of rendering it here', () => {
    const html = renderCityPage(build(healthy()), APP);

    expect(html).not.toMatch(/<script(?![^>]*type="application\/ld\+json")/u);
  });

  it('states that the prices are asking prices', () => {
    expect(renderCityPage(build(healthy()), APP)).toContain('ולא ממחירי עסקאות שנסגרו');
  });

  it('builds a page for a city where nothing carries a price', () => {
    const rows = Array.from({ length: 6 }, () =>
      stat({ price: null, squareMeter: null, pricePerSquareMeter: null }),
    );
    const html = renderCityPage(build(rows), APP);

    expect(html).toContain('<h1>נדל״ן למכירה בחולון</h1>');
    expect(html).toContain('נכסים מוצעים');
  });
});
