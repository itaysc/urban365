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
    expect(html).toContain(`<link rel="alternate" hreflang="he" href="${APP}/">`);
    expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${APP}/">`);
    expect(html).toContain('content="index,follow"');
    expect(html).toContain('class="hero"');
    expect(html).toContain('/home/cover-1600.webp');
    expect(html).toContain('rel="preload"');
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

  it('names a city link for where it goes, and reads as a page rather than a menu', () => {
    expect(html).toContain('דירות למכירה בחולון');
    expect(html).toContain('<header');
    expect(html).toContain('<main');
    expect(html).toContain('<footer');
    expect(html).toContain('aria-label="ניווט ראשי"');
    expect(html).toContain('aria-label="נכסים שמורים"');
    const text = html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' ');
    const words = text.split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThanOrEqual(800);
    expect(html).toContain('איך מחפשים דירה בישראל');
  });

  it('offers the full city list and the agencies', () => {
    expect(html).toContain('href="/nadlan"');
    expect(html).toContain('href="/agencies"');
    expect(html).toContain('מרכז והשרון');
  });
});
