import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Browser, Page } from 'playwright';
import { agencyPageUrl, listingUrl } from './yad2.transform.js';
import type { AgencyDump, RawAgencyData, RawListing, Section } from './yad2.types.js';

/**
 * Real counts, not a spinner: the agency's first page already states how many listings
 * there are, so the total is known within a second of starting. `done`/`total` combine
 * both phases (one unit per feed page, one per listing) into a single monotonic bar.
 */
export interface ScrapeProgress {
  phase: 'starting' | 'feed' | 'listings' | 'done';
  pagesDone: number;
  pagesTotal: number;
  itemsDone: number;
  itemsTotal: number;
  done: number;
  total: number;
}

export class BotCheckError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Collects an agency's data out of the `__NEXT_DATA__` JSON yad2 embeds in every page —
 * no CSS selectors, so a restyle of yad2 does not break this.
 *
 * yad2 sits behind Radware Bot Manager, which serves a challenge page to a freshly
 * launched automation browser. Set YAD2_CDP_URL to attach to a Chrome that already
 * browses yad2 (started with --remote-debugging-port) and the session's cookies apply.
 */
@Injectable()
export class Yad2ScraperService {
  private readonly logger = new Logger(Yad2ScraperService.name);

  constructor(private readonly config: ConfigService) {}

  async scrape(
    agencyId: string,
    section: Section,
    onProgress: (p: ScrapeProgress) => void,
    options: { limit?: number; delayMs?: number } = {},
  ): Promise<AgencyDump> {
    const delay = options.delayMs ?? this.config.get<number>('yad2.delayMs') ?? 150;
    const cdpUrl = this.config.get<string>('yad2.cdpUrl');

    const { chromium } = await import('playwright');
    onProgress({ phase: 'starting', pagesDone: 0, pagesTotal: 0, itemsDone: 0, itemsTotal: 0, done: 0, total: 0 });

    let browser: Browser;
    let page: Page;
    // Set when we created the tab ourselves, so we only close what we opened.
    let openedOwnPage = false;

    if (cdpUrl) {
      await this.ensureTabExists(cdpUrl);
      browser = await chromium.connectOverCDP(cdpUrl);
      const context = browser.contexts()[0] ?? (await browser.newContext({ locale: 'he-IL' }));

      // Reuse a tab that is already open rather than creating one: a new tab pulls the
      // Chrome window to the front on every scrape. Reusing one lets that window sit
      // minimised or on another desktop and stay there.
      //
      // Only a blank tab or one already on yad2 is fair game — navigating a tab the user
      // is actually reading would hijack it, so anything else gets a fresh tab.
      const reusable = (url: string) =>
        url === '' || url === 'about:blank' || /^https?:\/\/(www\.)?(yad2|yad-il)\.co\.il\//.test(url);
      const existing = context.pages().find((p) => !p.isClosed() && reusable(p.url()));
      if (existing) {
        page = existing;
      } else {
        page = await context.newPage();
        openedOwnPage = true;
      }
      this.logger.log(`Attached to Chrome at ${cdpUrl} (${existing ? 'reusing a tab' : 'opened a tab'})`);
    } else {
      // Headless gets Radware's captcha — see the README. Kept so the failure is a clear
      // BotCheckError rather than a missing-browser crash.
      browser = await chromium.launch({ headless: true });
      page = await (await browser.newContext({ locale: 'he-IL' })).newPage();
    }

    try {
      const first = await this.loadAgencyPage(page, agencyId, section);
      const pagesTotal = first.pagination?.totalPages ?? 1;
      // The agency's own header states the listing count, so the total is real from here on.
      let itemsTotal = first.pagination?.total ?? 0;
      const feed: RawListing[] = [...(first.feed ?? [])];

      const report = (p: Omit<ScrapeProgress, 'done' | 'total'>) =>
        onProgress({ ...p, done: p.pagesDone + p.itemsDone, total: p.pagesTotal + p.itemsTotal });

      report({ phase: 'feed', pagesDone: 1, pagesTotal, itemsDone: 0, itemsTotal });

      // --- walk the paginated feed
      for (let p = 2; p <= pagesTotal; p++) {
        try {
          const data = await this.fetchNextData(page, agencyPageUrl(agencyId, section, p));
          feed.push(...(data.props?.pageProps?.agencyData?.feed ?? []));
        } catch (e) {
          this.logger.warn(`feed page ${p}: ${(e as Error).message}`);
        }
        report({ phase: 'feed', pagesDone: p, pagesTotal, itemsDone: 0, itemsTotal });
        await sleep(delay);
      }

      // --- open each listing for its full details
      const tokens = [...new Set(feed.map((f) => f.token).filter((t): t is string => Boolean(t)))];
      const wanted = options.limit ? tokens.slice(0, options.limit) : tokens;
      // Now the exact count is known; it can differ slightly from the header's figure.
      itemsTotal = wanted.length;
      const items: RawListing[] = [];
      const failed: string[] = [];

      report({ phase: 'listings', pagesDone: pagesTotal, pagesTotal, itemsDone: 0, itemsTotal });

      for (let i = 0; i < wanted.length; i++) {
        const token = wanted[i];
        try {
          const data = await this.fetchNextDataWithRetry(page, listingUrl(token));
          const query = (data.props?.pageProps?.dehydratedState?.queries ?? []).find((q) =>
            String(q.queryHash).includes('"item"'),
          );
          if (query?.state?.data) items.push(query.state.data as RawListing);
          else failed.push(token);
        } catch {
          failed.push(token);
        }
        report({ phase: 'listings', pagesDone: pagesTotal, pagesTotal, itemsDone: i + 1, itemsTotal });
        await sleep(delay);
      }

      report({ phase: 'done', pagesDone: pagesTotal, pagesTotal, itemsDone: wanted.length, itemsTotal });

      return {
        agency: {
          details: first.details,
          brokers: first.brokers,
          subCategoriesAdsCount: first.subCategoriesAdsCount,
          pagination: first.pagination,
        },
        feed,
        items,
        failed,
      };
    } finally {
      if (cdpUrl) {
        // Closing the last tab leaves Chrome with no browser context, and the next
        // connectOverCDP then fails with "Browser context management is not supported".
        // So only close a tab we opened, and only while another one remains.
        const others = browser
          .contexts()
          .flatMap((c) => c.pages())
          .filter((p) => p !== page && !p.isClosed()).length;

        if (openedOwnPage && others > 0) await page.close().catch(() => undefined);
        else await page.goto('about:blank').catch(() => undefined);
      } else {
        await browser.close().catch(() => undefined);
      }
    }
  }


  /**
   * Playwright's connectOverCDP calls Browser.setDownloadBehavior, which needs a browser
   * context — and Chrome has none while every tab is closed. Opening a blank tab first
   * makes the connection work again without the user having to touch the window.
   */
  private async ensureTabExists(cdpUrl: string): Promise<void> {
    const base = cdpUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/json`, { signal: AbortSignal.timeout(3000) });
      const targets = (await res.json()) as { type?: string }[];
      if (targets.some((t) => t.type === 'page')) return;

      this.logger.warn('The attached Chrome has no open tab; opening a blank one.');
      await fetch(`${base}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(5000) });
    } catch (e) {
      // Not fatal on its own — let connectOverCDP report the real problem.
      this.logger.warn(`Could not check tabs on ${base}: ${(e as Error).message}`);
    }
  }

  /** Navigates to the agency page and reads its embedded payload. */
  private async loadAgencyPage(page: Page, agencyId: string, section: Section): Promise<RawAgencyData> {
    await page.goto(agencyPageUrl(agencyId, section), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    try {
      await page.waitForSelector('#__NEXT_DATA__', { state: 'attached', timeout: 30_000 });
    } catch {
      const title = await page.title().catch(() => '');
      throw new BotCheckError(
        `yad2 served a bot-check page instead of the agency page${title ? ` ("${title}")` : ''}.`,
      );
    }

    const data = await page.evaluate(
      () => JSON.parse(document.getElementById('__NEXT_DATA__')!.textContent!) as NextData,
    );
    const agency = data.props?.pageProps?.agencyData;
    if (!agency) throw new Error(`No agency data on the page — is ${agencyId} a yad2 agency id?`);
    return agency;
  }

  /**
   * Same-origin fetch from inside the loaded page, so the browser's cookies apply and no
   * full navigation is needed per listing.
   */
  private async fetchNextData(page: Page, url: string): Promise<NextData> {
    return page.evaluate(async (u) => {
      const res = await fetch(u, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
      const html = await res.text();
      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) throw new Error(`No __NEXT_DATA__ in ${u}`);
      return JSON.parse(m[1]) as NextData;
    }, url);
  }

  /**
   * Retries, then falls back to a real navigation — which is what "partnership" listings
   * need, since they redirect to yad-il.co.il where a same-origin fetch is blocked by CORS.
   */
  private async fetchNextDataWithRetry(page: Page, url: string, attempts = 3): Promise<NextData> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await this.fetchNextData(page, url);
      } catch (e) {
        lastError = e;
        await sleep(400 * (i + 1));
      }
    }

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForSelector('#__NEXT_DATA__', { state: 'attached', timeout: 30_000 });
      const data = await page.evaluate(
        () => JSON.parse(document.getElementById('__NEXT_DATA__')!.textContent!) as NextData,
      );
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      return data;
    } catch {
      throw lastError;
    }
  }
}

interface NextData {
  props?: {
    pageProps?: {
      agencyData?: RawAgencyData;
      dehydratedState?: { queries?: { queryHash?: string; state?: { data?: unknown } }[] };
    };
  };
}
