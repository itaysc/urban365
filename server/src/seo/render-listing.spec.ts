import { describe, expect, it } from 'vitest';
import type { ListingDetail, SimilarListing } from './listing-page.service.js';
import { listingSlug } from './listing-slug.js';
import { renderGonePage, renderListingPage } from './render-listing.js';

const APP = 'https://urban365.example';
const ID = 'cmvu0ayux0046xzh0ifihzgx6';

function listing(over: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: ID,
    section: 'forsale',
    price: 2_150_000,
    priceBeforeDrop: null,
    lastPriceDropAmount: null,
    lastPriceDropAt: null,
    publishedAt: null,
    pricePerSquareMeter: 22_396,
    rooms: 4,
    squareMeter: 96,
    squareMeterBuilt: null,
    squareMeterGarden: null,
    floor: 3,
    buildingTopFloor: 8,
    balconiesCount: 1,
    parkingSpacesCount: 1,
    propertyType: 'דירה',
    propertyCondition: 'משופץ',
    isNewFromDeveloper: false,
    isExclusive: false,
    city: 'חולון',
    neighborhood: 'קרית שרת',
    street: 'סוקולוב',
    houseNumber: 15,
    latitude: 32.01,
    longitude: 34.77,
    amenities: ['מעלית', 'ממ״ד'],
    description: 'דירה מרווחת ומוארת.\nקומה שלישית עם מעלית.',
    coverImageUrl: 'https://img.example/cover.jpg',
    imageUrls: ['https://img.example/cover.jpg', 'https://img.example/2.jpg'],
    listedAt: new Date('2026-10-20T00:00:00Z'),
    lastSeenAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    agency: { id: 'agency1', name: 'סוכנות הדגמה', licenseNumber: '12345' },
    images: [],
    ...over,
  } as ListingDetail;
}

const similar: SimilarListing[] = [
  {
    id: 'cmvu0ayux0047xzh0ifihzgx7',
    price: 2_300_000,
    lastPriceDropAmount: null,
    lastPriceDropAt: null,
    listedAt: null,
    publishedAt: null,
    rooms: 4,
    squareMeter: 100,
    street: 'הרצל',
    houseNumber: 88,
    neighborhood: null,
    city: 'חולון',
    propertyType: 'דירה',
    coverImageUrl: null,
  },
];

/** Every JSON-LD block on the page, parsed. */
function structured(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/gu)].map(
    (m) => JSON.parse(m[1]) as Record<string, unknown>,
  );
}

describe('renderListingPage', () => {
  it('titles the page the way somebody would have searched for it', () => {
    const html = renderListingPage(listing(), [], APP);

    expect(html).toContain('<h1>דירה 4 חדרים בסוקולוב 15, חולון</h1>');
  });

  it('leaves the neighbourhood out of the title and keeps it in the trail', () => {
    // A result page shows about sixty characters, and on a long street name the
    // neighbourhood is what pushes the city — the searched-for word — past the cut.
    const html = renderListingPage(listing(), [], APP);
    const title = /<title>([^<]+)<\/title>/u.exec(html)?.[1] ?? '';
    const trail = structured(html).find((d) => d['@type'] === 'BreadcrumbList');
    const names = ((trail?.itemListElement ?? []) as { name: string }[]).map((i) => i.name);

    expect(title).not.toContain('קרית שרת');
    expect(names).toContain('סוקולוב 15, קרית שרת, חולון');
  });

  it('canonicalises to the address-and-id URL on the public site', () => {
    const html = renderListingPage(listing(), [], APP);
    const slug = encodeURIComponent(listingSlug(ID, listing()));

    expect(html).toContain(`<link rel="canonical" href="${APP}/nadlan/property/${slug}">`);
  });

  it('never prints a phone number', () => {
    // The app hands one out at a time from a rate-limited route behind a button. A page
    // written for crawlers is exactly where that restraint would be undone.
    const html = renderListingPage(listing(), similar, APP);

    expect(html).not.toMatch(/0\d{1,2}-?\d{7}/u);
    expect(html).not.toContain('tel:');
    expect(html).not.toContain('wa.me');
  });

  it('says a rent is monthly, on the headline and in the structured data', () => {
    const html = renderListingPage(listing({ section: 'rent', price: 5_200 }), [], APP);
    const data = structured(html).find((d) => d['@type'] === 'RealEstateListing');

    expect(html).toContain('5,200 ₪ לחודש');
    expect(data?.offers).toMatchObject({
      priceSpecification: { price: 5_200, priceCurrency: 'ILS', unitCode: 'MON' },
    });
  });

  it('states a sale price plainly', () => {
    const data = structured(renderListingPage(listing(), [], APP)).find(
      (d) => d['@type'] === 'RealEstateListing',
    );

    expect(data?.offers).toMatchObject({ price: 2_150_000, priceCurrency: 'ILS' });
  });

  it('describes only what the record holds', () => {
    const bare = listing({
      rooms: null,
      squareMeter: null,
      floor: null,
      latitude: null,
      longitude: null,
      price: null,
    });
    const data = structured(renderListingPage(bare, [], APP)).find(
      (d) => d['@type'] === 'RealEstateListing',
    );
    const about = data?.about as Record<string, unknown>;

    expect(data).not.toHaveProperty('offers');
    expect(about).not.toHaveProperty('numberOfRooms');
    expect(about).not.toHaveProperty('floorSize');
    expect(about).not.toHaveProperty('geo');
    expect(about).toHaveProperty('address');
  });

  it('calls a flat an Apartment and a house a House', () => {
    const flat = structured(renderListingPage(listing(), [], APP))[1].about as { '@type': string };
    const house = structured(renderListingPage(listing({ propertyType: 'קוטג׳' }), [], APP))[1]
      .about as { '@type': string };

    expect(flat['@type']).toBe('Apartment');
    expect(house['@type']).toBe('House');
  });

  it('keeps the seller paragraphs apart', () => {
    const html = renderListingPage(listing(), [], APP);

    expect(html).toContain('<p>דירה מרווחת ומוארת.</p>');
    expect(html).toContain('<p>קומה שלישית עם מעלית.</p>');
  });

  it('escapes a description rather than trusting the feed it came from', () => {
    const html = renderListingPage(listing({ description: '<img src=x onerror=alert(1)>' }), [], APP);

    expect(html).not.toContain('<img src=x');
  });

  it('escapes a value on its way into the structured data too', () => {
    const html = renderListingPage(listing({ street: '</script><script>alert(1)</script>' }), [], APP);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/gu)];

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(() => blocks.map((b) => JSON.parse(b[1]))).not.toThrow();
  });

  it('shows the price it used to ask when it has come down', () => {
    const html = renderListingPage(listing({ priceBeforeDrop: 2_400_000 }), [], APP);

    expect(html).toContain('2,400,000 ₪');
    expect(html).toContain('class="was"');
  });

  it('ignores a "drop" to a higher price', () => {
    const html = renderListingPage(listing({ priceBeforeDrop: 1_000_000 }), [], APP);

    expect(html).not.toContain('class="was"');
  });

  it('links on to other properties and back to the city', () => {
    const html = renderListingPage(listing(), similar, APP);

    expect(html).toContain('/nadlan/property/');
    expect(html).toContain(`/nadlan/forsale/${encodeURIComponent('חולון')}`);
  });

  it('names the agency without handing over a way to call it', () => {
    const html = renderListingPage(listing(), [], APP);

    expect(html).toContain('סוכנות הדגמה');
    expect(html).toContain('רישיון תיווך 12345');
  });

  it('builds a page for a private seller, who has no agency', () => {
    const html = renderListingPage(listing({ agency: null }), [], APP);

    expect(html).toContain('<h1>');
    expect(html).not.toContain('מי מוכר');
  });

  it('loads no script of its own beyond the session check', () => {
    const html = renderListingPage(listing(), similar, APP);
    const scripts = [...html.matchAll(/<script([^>]*)>/gu)].map((m) => m[1]);

    expect(scripts.filter((a) => a.includes('ld+json'))).toHaveLength(2);
    expect(scripts.filter((a) => a.trim() === '')).toHaveLength(1);
    expect(html).not.toMatch(/<script[^>]*src=/u);
  });

  it('keeps the snippet short enough to be shown whole', () => {
    const long = 'דירה מרווחת מאוד. '.repeat(40);
    const html = renderListingPage(listing({ description: long }), [], APP);
    const description = /name="description" content="([^"]+)"/u.exec(html)?.[1] ?? '';

    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.length).toBeGreaterThan(50);
  });
});

describe('renderGonePage', () => {
  it('says what happened rather than reading as an error', () => {
    const html = renderGonePage({ city: 'חולון', section: 'forsale', similar }, APP);

    expect(html).toContain('הנכס כבר לא מוצע בחולון');
    expect(html).toContain('נכסים נוספים בחולון');
  });

  it('asks not to be indexed, and points its canonical somewhere that exists', () => {
    const html = renderGonePage({ city: 'חולון', section: 'forsale', similar }, APP);

    expect(html).toContain('content="noindex,follow"');
    expect(html).toContain(`href="${APP}/nadlan/forsale/${encodeURIComponent('חולון')}"`);
  });

  it('falls back to the city index for a listing with no city', () => {
    const html = renderGonePage({ city: null, section: 'forsale', similar: [] }, APP);

    expect(html).toContain(`href="${APP}/nadlan"`);
  });
});
