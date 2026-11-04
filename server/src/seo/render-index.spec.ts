import { describe, expect, it } from 'vitest';
import type { CityEntry } from './city-page.service.js';
import { toSlug } from './city-slug.js';
import { renderAllCitiesPage } from './render-all-cities.js';
import { renderIndexPage } from './render-index.js';

const APP = 'https://urban365.example';

const entry = (city: string, counts: Partial<CityEntry['counts']> = {}): CityEntry => ({
  city,
  counts: { forsale: 0, rent: 0, commercial: 0, ...counts },
  updatedAt: new Date('2026-11-01T00:00:00Z'),
});

const groups = [{ name: 'מרכז והשרון', cities: [entry('חולון', { forsale: 12 }), entry('אזור')] }];
const searchFor = (city: string) =>
  `/search?${new URLSearchParams({ section: 'forsale', city })}`.replaceAll('&', '&amp;');

describe('renderIndexPage', () => {
  const html = renderIndexPage(groups, { cities: 40, listings: 1234 }, APP);

  it('links a city with listings to its page', () => {
    expect(html).toContain(`href="/nadlan/forsale/${encodeURIComponent(toSlug('חולון'))}"`);
  });

  it('links a city with nothing on offer to the search, since its page would 404', () => {
    expect(html).toContain(`href="${searchFor('אזור')}"`);
    expect(html).not.toContain(`/nadlan/forsale/${encodeURIComponent(toSlug('אזור'))}`);
    expect(html).toContain('אין נכסים כרגע');
  });

  it('takes its headline from the totals, not from the cities it shows', () => {
    expect(html).toContain('ב-40 ערים');
  });

  it('links to the full list', () => {
    expect(html).toContain('href="/nadlan/cities"');
  });
});

describe('renderAllCitiesPage', () => {
  const html = renderAllCitiesPage(groups, APP);

  it('lists every city as a plain link under its district, without cards', () => {
    expect(html).toContain('<h2>מרכז והשרון</h2>');
    expect(html).toContain(`<a href="/nadlan/forsale/${encodeURIComponent(toSlug('חולון'))}">חולון</a>`);
    expect(html).toContain(`<a href="${searchFor('אזור')}">אזור</a>`);
    expect(html).not.toContain('class="cities"');
  });

  it('is canonical on the public site', () => {
    expect(html).toContain(`${APP}/nadlan/cities`);
  });
});
