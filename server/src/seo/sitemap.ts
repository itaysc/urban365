import { SECTIONS } from '../yad2/yad2.types.js';
import { BLOG_POSTS, BLOG_PUBLISHED, blogPath } from './blog.js';
import type { CityEntry } from './city-page.service.js';
import { toSlug } from './city-slug.js';
import { listingPath } from './listing-slug.js';
import { MIN_INDEXABLE } from './render-city.js';

/**
 * Listings per sitemap file.
 *
 * The protocol allows fifty thousand URLs and fifty uncompressed megabytes per file,
 * and this is well inside both. Smaller files are also kinder to us: each one is a
 * single bounded query, so the memory a crawler can make us spend does not grow with
 * the size of the inventory.
 */
export const LISTINGS_PER_SITEMAP = 5_000;

/**
 * The parts of the site a crawler is invited into, and the ones it is not.
 *
 * Everything behind a sign-in is listed explicitly rather than left to 401s. A crawler
 * that asks for `/app/customers` gets the React shell and a redirect that happens in
 * JavaScript, which from the outside looks like a real page with no content on it — and
 * a few hundred of those is how a site teaches a search engine that it is mostly empty.
 *
 * `Disallow` is not a security control and nothing here relies on it being one; the
 * tenant policies in the database are what keep an agency's data private.
 */
const CLOSED = [
  '/api/',
  '/app',
  '/admin',
  '/sell',
  '/account',
  '/saved',
  '/alerts',
  '/viewing/',
  '/login',
  '/signup',
  '/accept-invite',
  '/join',
  '/forgot-password',
  '/reset-password',
];

/**
 * Answer engines. They may read the blog and the llms.txt files, and nothing else.
 *
 * The listings, city pages and agency pages stay closed: those belong to the people
 * who published them. The blog is written to be found, including by a model that
 * answers from it, so refusing these crawlers would hide the pages.
 */
const READERS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'cohere-ai',
];

/** What an answer engine is allowed to fetch. Everything else on the site stays shut. */
const READER_RULES = ['Allow: /llms.txt', 'Allow: /llms-full.txt', 'Allow: /blog', 'Disallow: /'];

/**
 * Crawlers that copy the site in bulk. None of them sends a visitor here, and unlike
 * the answer engines above they are not how a person finds an article, so each is
 * refused outright.
 */
const REFUSED = [
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  'Diffbot',
  'Omgilibot',
  'ImagesiBot',
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'PetalBot',
  'DataForSeoBot',
  'Scrapy',
];

const closedRules = CLOSED.map((path) => `Disallow: ${path}`);

export function robotsTxt(appUrl: string): string {
  return [
    '# Scraping this site is not permitted.',
    '# The listings, agency pages and city pages belong to Urban365 and to the people who',
    '# published them. Crawlers that ignore this file, or that copy pages in bulk, may be',
    '# rate-limited or blocked.',
    '',
    '# Google Search. Public pages are open; everything behind a sign-in is closed.',
    'User-agent: Googlebot',
    'Allow: /',
    ...closedRules,
    '',
    '# Google AI training stays opted out of the listings. The blog is published to be',
    '# read, so it is open here too. This opt-out does not affect Google Search rankings.',
    'User-agent: Google-Extended',
    ...READER_RULES,
    '',
    '# Answer engines may read the blog and the llms.txt files. Nothing else.',
    ...READERS.flatMap((agent) => [`User-agent: ${agent}`, ...READER_RULES, '']),
    '# Refused outright: bulk scrapers.',
    ...REFUSED.flatMap((agent) => [`User-agent: ${agent}`, 'Disallow: /', '']),
    '# Every other crawler: public pages are open; everything behind a sign-in is closed.',
    'User-agent: *',
    ...closedRules,
    '',
    `Sitemap: ${appUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

/** XML has five characters that cannot appear raw, and a city name is somebody else's text. */
function xml(value: string): string {
  return value.replace(/[&<>"']/gu, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&apos;',
  );
}

interface Url {
  loc: string;
  lastmod?: Date;
  changefreq?: string;
  priority?: string;
}

function urlset(urls: Url[]): string {
  const body = urls
    .map((url) =>
      [
        '  <url>',
        `    <loc>${xml(url.loc)}</loc>`,
        url.lastmod ? `    <lastmod>${url.lastmod.toISOString().slice(0, 10)}</lastmod>` : null,
        url.changefreq ? `    <changefreq>${url.changefreq}</changefreq>` : null,
        url.priority ? `    <priority>${url.priority}</priority>` : null,
        '  </url>',
      ]
        .filter((line) => line !== null)
        .join('\n'),
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

/**
 * Every page worth offering, with the date it last changed.
 *
 * A city page appears only once it has enough listings to be worth reading —
 * `MIN_INDEXABLE`, the same threshold that decides whether the page carries `noindex`.
 * The two have to agree: a sitemap that offers a page the page itself asks not to index
 * is a contradiction, and the crawler resolves it by trusting neither.
 */
export function sitemapCitiesXml(entries: CityEntry[], appUrl: string): string {
  const urls: Url[] = [
    { loc: `${appUrl}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${appUrl}/nadlan`, changefreq: 'daily', priority: '0.9' },
    { loc: `${appUrl}/nadlan/cities`, changefreq: 'weekly', priority: '0.6' },
  ];

  for (const entry of entries) {
    for (const section of SECTIONS) {
      if (entry.counts[section] < MIN_INDEXABLE) continue;

      urls.push({
        loc: `${appUrl}/nadlan/${section}/${encodeURIComponent(toSlug(entry.city))}`,
        lastmod: entry.updatedAt,
        changefreq: 'daily',
        priority: priorityFor(entry.counts[section]),
      });
    }
  }

  return urlset(urls);
}

/**
 * The blog, as its own file.
 *
 * It used to ride along in the cities file, which is where a crawler that only reads
 * the index would never see it named. A file of its own is listed from `sitemap.xml`
 * next to the cities and the listings, and it stays in step with the catalog: a new
 * article is a new URL here without anyone editing the index.
 */
export function sitemapBlogXml(appUrl: string): string {
  const urls: Url[] = [
    { loc: `${appUrl}/blog`, lastmod: BLOG_PUBLISHED, changefreq: 'monthly', priority: '0.6' },
    ...BLOG_POSTS.map((post) => ({
      loc: `${appUrl}${blogPath(post.slug)}`,
      lastmod: BLOG_PUBLISHED,
      changefreq: 'monthly' as const,
      priority: '0.5',
    })),
  ];

  return urlset(urls);
}

/**
 * A hint at how much of the site's weight sits on this page.
 *
 * Relative, and read as such: a city with four hundred flats is more of what this site
 * is than a town with eight, and saying so is more honest than giving every page 0.5.
 */
function priorityFor(count: number): string {
  if (count >= 200) return '0.8';
  if (count >= 50) return '0.7';
  if (count >= 20) return '0.6';
  return '0.5';
}

/** The listing pages, one file's worth. */
export function sitemapListingsXml(
  listings: {
    id: string;
    street: string | null;
    houseNumber: number | null;
    neighborhood: string | null;
    city: string | null;
    lastSeenAt: Date;
  }[],
  appUrl: string,
): string {
  return urlset(
    listings.map((listing) => ({
      loc: `${appUrl}${listingPath(listing.id, listing)}`,
      lastmod: listing.lastSeenAt,
      // A property changes when its price does, which is not often but matters when it
      // happens — and it leaves the market without warning, which is what `daily` is
      // really asking a crawler to notice.
      changefreq: 'daily',
      priority: '0.6',
    })),
  );
}

/**
 * The index: one entry per file above.
 *
 * `/sitemap.xml` is an index rather than a list because the number of listings follows
 * the size of the business and a single file would eventually have to be split anyway —
 * at which point the URL everybody has already given to Google would change meaning.
 * Splitting it now costs one more request and never has to be undone.
 */
export function sitemapIndexXml(paths: string[], appUrl: string, lastmod: Date): string {
  const body = paths
    .map(
      (path) =>
        `  <sitemap>\n    <loc>${xml(`${appUrl}${path}`)}</loc>\n` +
        `    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>\n  </sitemap>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>
`;
}

/** How many listing files the index needs. At least one, even with nothing to list. */
export const sitemapFileCount = (listings: number) =>
  Math.max(1, Math.ceil(listings / LISTINGS_PER_SITEMAP));
