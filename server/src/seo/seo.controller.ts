import { Controller, Get, Header, Param, Res, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { MailConfig } from '../config/configuration.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { SECTIONS, type Section } from '../yad2/yad2.types.js';
import { ClosedSitePages } from './closed-site-pages.js';
import { CityPageService } from './city-page.service.js';
import { esc } from './html.js';
import { page, SESSION_SCRIPT_HASH } from './layout.js';
import { ListingPageService } from './listing-page.service.js';
import { idFromSlug, listingPath } from './listing-slug.js';
import { renderCityPage } from './render-city.js';
import { renderCreditsPage } from './render-credits.js';
import { renderFooterLinks } from './footer.js';
import { renderAllCitiesPage } from './render-all-cities.js';
import { renderIndexPage, totalIn } from './render-index.js';
import { renderGonePage, renderListingPage } from './render-listing.js';
import {
  LISTINGS_PER_SITEMAP,
  robotsTxt,
  sitemapCitiesXml,
  sitemapFileCount,
  sitemapIndexXml,
  sitemapListingsXml,
} from './sitemap.js';

/**
 * Five minutes at the edge, an hour of serving the old copy while a new one is built.
 *
 * These pages are read by machines far more often than by people, and the thing they
 * describe — a city's asking prices — moves on the timescale of a scrape run. Nothing
 * here is personalised, so `public` is safe and a CDN in front would mean most crawls
 * never reach the application at all.
 */
const CACHE = 'public, max-age=300, stale-while-revalidate=3600';

/**
 * A policy of their own, because helmet's default one is written for the API.
 *
 * Its `img-src 'self' data:` would blank every listing photograph on these pages — the
 * covers are served from the feed's CDN and from our own bucket, neither of which is
 * this origin. Everything else is tightened rather than loosened in exchange: no
 * scripts at all, since the page is text and links and nothing on it runs, and no
 * frames, forms or base rewriting.
 */
const CSP = [
  "default-src 'none'",
  /*
   * `'self'` as well as https: the favicon is served from this origin, and without it
   * the policy blocked the site's own icon on every one of these pages — invisibly,
   * since a missing favicon looks like a browser being slow.
   */
  "img-src 'self' https: data:",
  // The stylesheet is inline, which is the whole reason the page arrives in one request.
  "style-src 'unsafe-inline'",
  /*
   * One script, named by its hash — the session check in `layout.ts`. Not
   * `unsafe-inline`: the page is assembled from a scraped feed, and a policy that
   * allowed any inline script would be trusting every street name in the country.
   */
  `script-src '${SESSION_SCRIPT_HASH}'`,
  // Which is what that script talks to, and the only thing this page talks to at all.
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const isSection = (value: string): value is Section => (SECTIONS as string[]).includes(value);

/**
 * The part of the site a search engine can read.
 *
 * The product is a static React bundle: ask it for a city and you get an empty `<div>`
 * until JavaScript runs. Google will usually run it; Bing, and most of what now reads
 * the web on somebody's behalf, will not. So the pages worth finding are rendered here
 * instead, as HTML, by the server that already holds the listings.
 *
 * Mounted outside `/api/v1` — these are pages, not API resources, and the version in
 * the path would be a promise to break their URLs one day. `main.ts` excludes them from
 * the global prefix, the same way `/health` is excluded.
 *
 * In production the public site and this server are different origins, so the host
 * serving the client proxies these paths through. Every canonical, every sitemap entry
 * and every link into the app is written against `APP_URL` for that reason: whichever
 * origin served the bytes, the page says it lives on the public site. See PRODUCTION.md.
 */
@Public()
@UseInterceptors(ClosedSitePages)
// Generous next to the global 300/min: a crawler working through a few hundred cities
// is the traffic these pages exist for, and rate-limiting it is rate-limiting the point.
@Throttle({ default: { limit: 1_200, ttl: 60_000 } })
@Controller()
export class SeoController {
  private readonly appUrl: string;

  constructor(
    private readonly cities: CityPageService,
    private readonly listings: ListingPageService,
    config: ConfigService,
  ) {
    /*
     * `APP_URL`, which the config happens to keep under `mail` — it arrived there with
     * the email links and the rest of the codebase now reads it from there for
     * everything, auth redirects and calendar links included. Followed rather than
     * fixed here: moving it is a nine-file rename that has nothing to do with these
     * pages.
     */
    this.appUrl = config.getOrThrow<MailConfig>('mail').appUrl.replace(/\/+$/u, '');
  }

  /**
   * The link columns every page ends with.
   *
   * Built from the directory the service already caches, so a page costs no extra
   * query for them — and rebuilt on each request rather than memoised here, because
   * string concatenation is cheaper than the bug where the footer still names a city
   * the agency stopped selling in an hour ago.
   */
  private async footer(): Promise<string> {
    return renderFooterLinks(await this.cities.cities(), this.appUrl);
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', CACHE)
  robots(): string {
    return robotsTxt(this.appUrl);
  }

  /** An index of the files below, so the set can grow without the URL changing. */
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', CACHE)
  async sitemap(): Promise<string> {
    const files = sitemapFileCount(await this.listings.countForSitemap());
    const paths = [
      '/sitemap-cities.xml',
      ...Array.from({ length: files }, (_, i) => `/sitemap-listings-${i + 1}.xml`),
    ];

    return sitemapIndexXml(paths, this.appUrl, new Date());
  }

  @Get('sitemap-cities.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', CACHE)
  async sitemapCities(): Promise<string> {
    return sitemapCitiesXml(await this.cities.cities(), this.appUrl);
  }

  /**
   * One file's worth of listings, numbered from 1.
   *
   * A page number past the end is a 404 rather than an empty file: an empty sitemap is
   * a valid document, so returning one would let a crawler walk forever without ever
   * being told to stop.
   */
  @Get('sitemap-listings-:index.xml')
  async sitemapListings(@Param('index') index: string, @Res() res: Response): Promise<void> {
    const page = Number(index);
    const files = sitemapFileCount(await this.listings.countForSitemap());

    if (!Number.isInteger(page) || page < 1 || page > files) {
      res.status(404).type('text/plain; charset=utf-8').send('No such sitemap.');
      return;
    }

    const rows = await this.listings.forSitemap((page - 1) * LISTINGS_PER_SITEMAP, LISTINGS_PER_SITEMAP);

    res
      .type('application/xml; charset=utf-8')
      .set('Cache-Control', CACHE)
      .send(sitemapListingsXml(rows, this.appUrl));
  }

  @Get('nadlan')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', CACHE)
  @Header('Content-Security-Policy', CSP)
  async index(): Promise<string> {
    const [groups, held, links] = await Promise.all([
      this.cities.featuredByDistrict(),
      this.cities.cities(),
      this.footer(),
    ]);
    const totals = {
      cities: held.length,
      listings: held.reduce((n, entry) => n + totalIn(entry), 0),
    };
    return renderIndexPage(groups, totals, this.appUrl, links);
  }

  /** Every city by district, as links — the "all cities" the index links to. */
  @Get('nadlan/cities')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', CACHE)
  @Header('Content-Security-Policy', CSP)
  async allCities(): Promise<string> {
    const [groups, links] = await Promise.all([this.cities.allByDistrict(), this.footer()]);
    return renderAllCitiesPage(groups, this.appUrl, links);
  }

  /**
   * One property.
   *
   * The slug carries the address and the id, and only the id is looked up — so a
   * listing whose address was corrected keeps working on the old link and is moved to
   * the new one with a 301, which is how the address in a URL stays a convenience
   * rather than a thing that can rot.
   */
  /**
   * Who took the photographs.
   *
   * Its own page because Creative Commons asks for credit in a manner reasonable to
   * the medium and its guidance names exactly this — a page of attribution — and
   * because thirty names in a paragraph under a grid served nobody.
   */
  @Get('nadlan/credits')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', CACHE)
  @Header('Content-Security-Policy', CSP)
  async credits(): Promise<string> {
    return renderCreditsPage(this.appUrl, await this.footer());
  }

  @Get('nadlan/property/:slug')
  async property(@Param('slug') slug: string, @Res() res: Response): Promise<void> {
    const result = await this.listings.page(idFromSlug(slug));

    if (result.state === 'missing') {
      res
        .status(404)
        .type('text/html; charset=utf-8')
        .set('Content-Security-Policy', CSP)
        .send(this.missing('הנכס לא נמצא', 'הקישור לא מפנה לנכס שאנחנו מכירים.'));
      return;
    }

    if (result.state === 'gone') {
      // 410, not 404: the URL is deliberately finished, and saying so gets it dropped
      // from an index in one pass instead of being re-crawled for weeks.
      res
        .status(410)
        .type('text/html; charset=utf-8')
        .set('Content-Security-Policy', CSP)
        .send(renderGonePage(result, this.appUrl, await this.footer()));
      return;
    }

    const canonical = listingPath(result.listing.id, result.listing);
    if (decodeURIComponent(`/nadlan/property/${slug}`) !== decodeURIComponent(canonical)) {
      res.redirect(301, canonical);
      return;
    }

    res
      .type('text/html; charset=utf-8')
      .set('Content-Security-Policy', CSP)
      .set('Cache-Control', CACHE)
      .send(renderListingPage(result.listing, result.similar, this.appUrl, await this.footer()));
  }

  /*
   * Declared after `nadlan/property/:slug` on purpose: Nest matches in declaration
   * order, and this pattern would otherwise swallow it with `section` set to the
   * word "property" — a 404 on every listing page, from a route that looks correct.
   */
  @Get('nadlan/:section/:city')
  async city(
    @Param('section') section: string,
    @Param('city') city: string,
    @Res() res: Response,
  ): Promise<void> {
    res.type('text/html; charset=utf-8').set('Content-Security-Policy', CSP);

    if (!isSection(section)) {
      // A made-up section is a made-up page, and saying so with a 404 keeps it out of
      // the index rather than letting a crawler collect variations of it.
      res.status(404).send(this.missing('הדף לא נמצא', 'הקישור מפנה לקטגוריה שלא קיימת.'));
      return;
    }

    const data = await this.cities.page(city, section);
    if (!data) {
      res
        .status(404)
        .send(
          this.missing(
            'אין נכסים להצגה',
            'לא מצאנו נכסים בקטגוריה הזו בעיר הזו. ייתכן שהם נמכרו, וייתכן שהעיר נכתבת אצלנו אחרת.',
          ),
        );
      return;
    }

    res.set('Cache-Control', CACHE).send(renderCityPage(data, this.appUrl, await this.footer()));
  }

  /** A 404 that is still a page: it says what happened and offers the way back. */
  private missing(heading: string, explanation: string): string {
    return page({
      title: `${heading} | Urban365`,
      description: explanation,
      canonical: `${this.appUrl}/nadlan`,
      indexable: false,
      appUrl: this.appUrl,
      body: `<h1>${esc(heading)}</h1>
<p class="lede">${esc(explanation)}</p>
<a class="cta" href="/nadlan">לרשימת הערים</a>`,
    });
  }
}
