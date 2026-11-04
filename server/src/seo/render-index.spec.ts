import { describe, expect, it } from 'vitest';
import type { CityEntry } from './city-page.service.js';
import { toSlug } from './city-slug.js';
import { renderIndexPage } from './render-index.js';

const APP = 'https://urban365.example';

const entry = (city: string, counts: Partial<CityEntry['counts']> = {}): CityEntry => ({
  city,
  counts: { forsale: 0, rent: 0, commercial: 0, ...counts },
  updatedAt: new Date('2026-11-01T00:00:00Z'),
});

describe('renderIndexPage', () => {
  const html = renderIndexPage(
    [{ name: 'מרכז והשרון', cities: [entry('חולון', { forsale: 12 }), entry('אזור')] }],
    APP,
  );

  it('links a city with listings to its page', () => {
    expect(html).toContain(`href="/nadlan/forsale/${encodeURIComponent(toSlug('חולון'))}"`);
  });

  it('links a city with nothing on offer to the search, since its page would 404', () => {
    const search = `/search?${new URLSearchParams({ section: 'forsale', city: 'אזור' })}`;
    expect(html).toContain(`href="${search.replaceAll('&', '&amp;')}"`);
    expect(html).not.toContain(`/nadlan/forsale/${encodeURIComponent(toSlug('אזור'))}`);
    expect(html).toContain('אין נכסים כרגע');
  });

  it('counts only the cities that have listings in the headline', () => {
    expect(html).toContain('ב-1 ערים');
  });
});
