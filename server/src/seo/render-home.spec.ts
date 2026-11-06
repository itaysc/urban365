import { describe, expect, it } from 'vitest';
import type { CityEntry } from './city-page.service.js';
import { toSlug } from './city-slug.js';
import { renderHomePage } from './render-home.js';

const APP = 'https://urban365.example';

const entry = (city: string, counts: Partial<CityEntry['counts']> = {}): CityEntry => ({
  city,
  counts: { forsale: 0, rent: 0, commercial: 0, ...counts },
  updatedAt: new Date('2026-11-01T00:00:00Z'),
});

const html = renderHomePage(
  [{ name: 'מרכז והשרון', cities: [entry('חולון', { forsale: 12 }), entry('אזור')] }],
  APP,
);

describe('renderHomePage', () => {
  it('is the front door: one headline, on the public site', () => {
    expect(html).toContain('<h1>דירות למכירה ולהשכרה בישראל</h1>');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(`<link rel="canonical" href="${APP}/">`);
    expect(html).toContain('content="index,follow"');
    expect(html).toContain('class="hero"');
    expect(html).toContain('Tel_Aviv_Skyline');
  });

  it('asks where, the same way the app does, and opens the search', () => {
    expect(html).toContain('action="/search"');
    expect(html).toContain('value="forsale"');
    expect(html).toContain('value="rent"');
    expect(html).toContain('placeholder="עיר, שכונה או רחוב"');
    expect(html).toContain('role="combobox"');
  });

  it('names the site for a machine', () => {
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain(`"url":"${APP}/"`);
  });

  it('links a city with listings to its page, and an empty one to the search', () => {
    expect(html).toContain(`href="/nadlan/forsale/${encodeURIComponent(toSlug('חולון'))}"`);
    expect(html).toContain('href="/search?section=forsale&amp;city=%D7%90%D7%96%D7%95%D7%A8"');
    expect(html).toContain('>12<');
  });

  it('offers the full city list and the agencies', () => {
    expect(html).toContain('href="/nadlan"');
    expect(html).toContain('href="/agencies"');
    expect(html).toContain('מרכז והשרון');
  });
});
