import { describe, expect, it } from 'vitest';
import type { CityEntry } from './city-page.service.js';
import { MIN_INDEXABLE } from './render-city.js';
import {
  robotsTxt,
  sitemapCitiesXml,
  sitemapFileCount,
  sitemapIndexXml,
  sitemapListingsXml,
  LISTINGS_PER_SITEMAP,
} from './sitemap.js';

const APP = 'https://urban365.example';

const entry = (city: string, counts: Partial<CityEntry['counts']> = {}): CityEntry => ({
  city,
  counts: { forsale: 0, rent: 0, commercial: 0, ...counts },
  updatedAt: new Date('2026-10-29T11:00:00Z'),
});

/** The rules that apply to one crawler: its own group, as the file is read per group. */
function groupFor(txt: string, agent: string): string {
  const group = txt.split('\n\n').find((g) => g.includes(`User-agent: ${agent}\n`));
  if (!group) throw new Error(`no group for ${agent}`);
  return group;
}

describe('robotsTxt', () => {
  it('points at the sitemap on the public site', () => {
    expect(robotsTxt(APP)).toContain(`Sitemap: ${APP}/sitemap.xml`);
  });

  it('says plainly that scraping is not permitted', () => {
    expect(robotsTxt(APP)).toContain('Scraping this site is not permitted.');
  });

  it('keeps crawlers out of the parts that need an account', () => {
    const txt = robotsTxt(APP);

    expect(txt).toContain('Disallow: /app');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Disallow: /api/');
    expect(txt).toContain('Disallow: /account');
    expect(txt).toContain('Disallow: /join');
  });

  it('leaves the storefront open to every crawler that is not refused', () => {
    const star = groupFor(robotsTxt(APP), '*');
    expect(star).not.toMatch(/^Disallow: \/$/mu);
    expect(robotsTxt(APP)).not.toContain('Disallow: /nadlan');
  });

  it('gives Googlebot its own group, with the storefront open and the account pages shut', () => {
    const google = groupFor(robotsTxt(APP), 'Googlebot');

    expect(google).toContain('Allow: /');
    expect(google).not.toMatch(/^Disallow: \/$/mu);
    expect(google).toContain('Disallow: /app');
    expect(google).toContain('Disallow: /account');
  });

  it('opts out of Google AI training without touching Google Search', () => {
    expect(groupFor(robotsTxt(APP), 'Google-Extended')).toMatch(/^Disallow: \/$/mu);
    expect(groupFor(robotsTxt(APP), 'Googlebot')).not.toContain('Google-Extended');
  });

  it('lets answer engines read the blog and nothing else', () => {
    const txt = robotsTxt(APP);

    for (const agent of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
      const group = groupFor(txt, agent);
      expect(group, agent).toContain('Allow: /blog');
      expect(group, agent).toContain('Allow: /llms.txt');
      expect(group, agent).toMatch(/^Disallow: \/$/mu);
    }
  });

  it('refuses bulk scrapers by name, including the blog', () => {
    const txt = robotsTxt(APP);

    for (const agent of ['CCBot', 'Bytespider', 'AhrefsBot']) {
      const group = groupFor(txt, agent);
      expect(group, agent).toMatch(/^Disallow: \/$/mu);
      expect(group, agent).not.toContain('Allow: /blog');
    }
  });
});

describe('sitemapCitiesXml', () => {
  it('always offers the home page and the city index', () => {
    const xml = sitemapCitiesXml([], APP);

    expect(xml).toContain(`<loc>${APP}/</loc>`);
    expect(xml).toContain(`<loc>${APP}/nadlan</loc>`);
  });

  it('offers a city once it has enough listings to be worth reading', () => {
    const xml = sitemapCitiesXml([entry('חולון', { forsale: MIN_INDEXABLE })], APP);

    expect(xml).toContain(`/nadlan/forsale/${encodeURIComponent('חולון')}`);
  });

  it('agrees with the page about what is too thin to index', () => {
    // A sitemap that offers a page the page itself asks not to index is a contradiction,
    // and a crawler that finds one trusts neither half.
    const xml = sitemapCitiesXml([entry('שדרות', { forsale: MIN_INDEXABLE - 1 })], APP);

    expect(xml).not.toContain('/nadlan/forsale/');
  });

  it('judges each section on its own', () => {
    const xml = sitemapCitiesXml([entry('חולון', { forsale: 40, rent: 2 })], APP);

    expect(xml).toContain('/nadlan/forsale/');
    expect(xml).not.toContain('/nadlan/rent/');
  });

  it('dates each city by when we last saw anything in it', () => {
    expect(sitemapCitiesXml([entry('חולון', { forsale: 40 })], APP)).toContain(
      '<lastmod>2026-10-29</lastmod>',
    );
  });

  it('weights a city with real depth above a town with the bare minimum', () => {
    const big = sitemapCitiesXml([entry('תל אביב יפו', { forsale: 400 })], APP);
    const small = sitemapCitiesXml([entry('חריש', { forsale: MIN_INDEXABLE })], APP);

    expect(big).toContain('<priority>0.8</priority>');
    expect(small).toContain('<priority>0.5</priority>');
  });

  it('hyphenates a two-word city into one slug', () => {
    const xml = sitemapCitiesXml([entry('בת ים', { forsale: 40 })], APP);

    expect(xml).toContain(encodeURIComponent('בת-ים'));
    expect(xml).not.toContain('%20');
  });

  it('escapes a name that would otherwise break the document', () => {
    const xml = sitemapCitiesXml([entry('א&ב', { forsale: 40 })], APP);

    expect(xml).not.toMatch(/<loc>[^<]*&(?!amp;|apos;|quot;|lt;|gt;)/u);
  });

  it('is a well-formed urlset', () => {
    const xml = sitemapCitiesXml([entry('חולון', { forsale: 40 })], APP);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });
});

const listing = (id: string, city = 'חולון') => ({
  id,
  street: 'סוקולוב',
  houseNumber: 15,
  neighborhood: 'קרית שרת',
  city,
  lastSeenAt: new Date('2026-10-29T11:00:00Z'),
});

describe('sitemapListingsXml', () => {
  it('gives each property an address in its URL', () => {
    const xml = sitemapListingsXml([listing('cmvu0ayux0046xzh0ifihzgx6')], APP);

    expect(xml).toContain(encodeURIComponent('סוקולוב-15-חולון-cmvu0ayux0046xzh0ifihzgx6'));
  });

  it('dates each one by when it was last seen', () => {
    expect(sitemapListingsXml([listing('cmvu0ayux0046xzh0ifihzgx6')], APP)).toContain(
      '<lastmod>2026-10-29</lastmod>',
    );
  });

  it('is an empty urlset rather than a broken document when there is nothing', () => {
    expect(sitemapListingsXml([], APP)).toContain('<urlset');
    expect(sitemapListingsXml([], APP)).not.toContain('<url>');
  });
});

describe('sitemapIndexXml', () => {
  it('lists each file against the public site', () => {
    const xml = sitemapIndexXml(['/sitemap-cities.xml'], APP, new Date('2026-11-01T00:00:00Z'));

    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain(`<loc>${APP}/sitemap-cities.xml</loc>`);
    expect(xml).toContain('<lastmod>2026-11-01</lastmod>');
  });

  it('is an index, not a urlset — the two are different documents', () => {
    const xml = sitemapIndexXml(['/sitemap-cities.xml'], APP, new Date());

    expect(xml).not.toContain('<urlset');
    expect(xml).not.toContain('<url>');
  });
});

describe('sitemapFileCount', () => {
  it('is one file when there is nothing to list, so the index is never empty', () => {
    expect(sitemapFileCount(0)).toBe(1);
  });

  it('fills a file before opening another', () => {
    expect(sitemapFileCount(LISTINGS_PER_SITEMAP)).toBe(1);
    expect(sitemapFileCount(LISTINGS_PER_SITEMAP + 1)).toBe(2);
  });
});
