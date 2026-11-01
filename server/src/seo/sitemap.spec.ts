import { describe, expect, it } from 'vitest';
import type { CityEntry } from './city-page.service.js';
import { MIN_INDEXABLE } from './render-city.js';
import { robotsTxt, sitemapXml } from './sitemap.js';

const APP = 'https://urban365.example';

const entry = (city: string, counts: Partial<CityEntry['counts']> = {}): CityEntry => ({
  city,
  counts: { forsale: 0, rent: 0, commercial: 0, ...counts },
  updatedAt: new Date('2026-10-29T11:00:00Z'),
});

describe('robotsTxt', () => {
  it('points at the sitemap on the public site', () => {
    expect(robotsTxt(APP)).toContain(`Sitemap: ${APP}/sitemap.xml`);
  });

  it('keeps crawlers out of the parts that need an account', () => {
    const txt = robotsTxt(APP);

    expect(txt).toContain('Disallow: /app');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Disallow: /api/');
  });

  it('leaves the storefront open', () => {
    expect(robotsTxt(APP)).not.toMatch(/^Disallow: \/$/mu);
    expect(robotsTxt(APP)).not.toContain('Disallow: /nadlan');
  });
});

describe('sitemapXml', () => {
  it('always offers the home page and the city index', () => {
    const xml = sitemapXml([], APP);

    expect(xml).toContain(`<loc>${APP}/</loc>`);
    expect(xml).toContain(`<loc>${APP}/nadlan</loc>`);
  });

  it('offers a city once it has enough listings to be worth reading', () => {
    const xml = sitemapXml([entry('חולון', { forsale: MIN_INDEXABLE })], APP);

    expect(xml).toContain(`/nadlan/forsale/${encodeURIComponent('חולון')}`);
  });

  it('agrees with the page about what is too thin to index', () => {
    // A sitemap that offers a page the page itself asks not to index is a contradiction,
    // and a crawler that finds one trusts neither half.
    const xml = sitemapXml([entry('שדרות', { forsale: MIN_INDEXABLE - 1 })], APP);

    expect(xml).not.toContain('/nadlan/forsale/');
  });

  it('judges each section on its own', () => {
    const xml = sitemapXml([entry('חולון', { forsale: 40, rent: 2 })], APP);

    expect(xml).toContain('/nadlan/forsale/');
    expect(xml).not.toContain('/nadlan/rent/');
  });

  it('dates each city by when we last saw anything in it', () => {
    expect(sitemapXml([entry('חולון', { forsale: 40 })], APP)).toContain(
      '<lastmod>2026-10-29</lastmod>',
    );
  });

  it('weights a city with real depth above a town with the bare minimum', () => {
    const big = sitemapXml([entry('תל אביב יפו', { forsale: 400 })], APP);
    const small = sitemapXml([entry('חריש', { forsale: MIN_INDEXABLE })], APP);

    expect(big).toContain('<priority>0.8</priority>');
    expect(small).toContain('<priority>0.5</priority>');
  });

  it('hyphenates a two-word city into one slug', () => {
    const xml = sitemapXml([entry('בת ים', { forsale: 40 })], APP);

    expect(xml).toContain(encodeURIComponent('בת-ים'));
    expect(xml).not.toContain('%20');
  });

  it('escapes a name that would otherwise break the document', () => {
    const xml = sitemapXml([entry('א&ב', { forsale: 40 })], APP);

    expect(xml).not.toMatch(/<loc>[^<]*&(?!amp;|apos;|quot;|lt;|gt;)/u);
  });

  it('is a well-formed urlset', () => {
    const xml = sitemapXml([entry('חולון', { forsale: 40 })], APP);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });
});
