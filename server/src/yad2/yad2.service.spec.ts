import { Test } from '@nestjs/testing';
import { AgencyCacheService } from './agency-cache.service.js';
import { AgencyRepository } from './agency.repository.js';
import { BotCheckError, Yad2ScraperService, type ScrapeProgress } from './yad2-scraper.service.js';
import { Yad2Service } from './yad2.service.js';
import type { AgencyDump } from './yad2.types.js';

const dump: AgencyDump = {
  agency: {
    details: { customerId: 1, officeName: 'TEST', licenseNumber: '123' },
    brokers: [{ id: 7, name: 'Broker', licenseNumber: '99', count: '2' }],
    subCategoriesAdsCount: { 5: 2, 6: 0, 7: 0 },
    pagination: { total: 2, totalPages: 1 },
  },
  feed: [{ token: 'a' }, { token: 'b' }],
  items: [{ token: 'a', price: 100 }, { token: 'b', price: 200 }],
  failed: [],
};

/** Replays the progress a real scrape reports, without touching yad2. */
class StubScraper {
  async scrape(_id: string, _section: string, onProgress: (p: ScrapeProgress) => void): Promise<AgencyDump> {
    onProgress({ phase: 'starting', pagesDone: 0, pagesTotal: 0, itemsDone: 0, itemsTotal: 0, done: 0, total: 0 });
    onProgress({ phase: 'feed', pagesDone: 1, pagesTotal: 1, itemsDone: 0, itemsTotal: 2, done: 1, total: 3 });
    onProgress({ phase: 'listings', pagesDone: 1, pagesTotal: 1, itemsDone: 1, itemsTotal: 2, done: 2, total: 3 });
    onProgress({ phase: 'listings', pagesDone: 1, pagesTotal: 1, itemsDone: 2, itemsTotal: 2, done: 3, total: 3 });
    return dump;
  }
}

class BotCheckScraper {
  async scrape(): Promise<AgencyDump> {
    throw new BotCheckError('yad2 served a bot-check page instead of the agency page.');
  }
}

const cacheStub = {
  read: async () => null,
  write: async (_id: string, _section: string, d: AgencyDump) => ({ dump: d, scrapedAt: '2026-01-01T00:00:00Z' }),
  list: async () => [],
};

/** Records what would be persisted, so the tests need no database. */
const repositoryStub = {
  saved: [] as { agencyId: string; section: string; listings: number }[],
  async saveDump(d: AgencyDump, agencyId: string, section: string) {
    this.saved.push({ agencyId, section, listings: d.feed.length });
  },
  async getAgency() {
    return null;
  },
  async listAgencies() {
    return [];
  },
};

const build = async (scraper: unknown) => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      Yad2Service,
      { provide: Yad2ScraperService, useValue: scraper },
      { provide: AgencyCacheService, useValue: cacheStub },
      { provide: AgencyRepository, useValue: repositoryStub },
    ],
  }).compile();
  return moduleRef.get(Yad2Service);
};

const settle = async (service: Yad2Service, jobId: string) => {
  for (let i = 0; i < 50; i++) {
    if (service.getJob(jobId).status !== 'running') return service.getJob(jobId);
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('job never finished');
};

describe('Yad2Service', () => {
  it('parses an agency number and a yad2 URL', async () => {
    const service = await build(new StubScraper());
    expect(service.parseInput('6816047')).toEqual({ agencyId: '6816047', section: null });
    expect(service.parseInput('https://www.yad2.co.il/realestate/agency/6816047/rent')).toEqual({
      agencyId: '6816047',
      section: 'rent',
    });
    expect(() => service.parseInput('nonsense')).toThrow();
  });

  it('reports real counts while scraping and finishes with the result', async () => {
    const service = await build(new StubScraper());
    const job = service.start('1', 'forsale');

    const finished = await settle(service, job.id);

    expect(finished.status).toBe('done');
    // The bar is monotonic and ends full.
    expect(finished.progress.done).toBe(finished.progress.total);
    expect(finished.progress.itemsDone).toBe(2);
    expect(finished.progress.itemsTotal).toBe(2);
    expect(finished.result?.assets).toHaveLength(2);
    expect(finished.result?.agency.name).toBe('TEST');
    expect(finished.result?.team).toHaveLength(1);

    // The same run is persisted, not just returned to the caller.
    expect(repositoryStub.saved.at(-1)).toEqual({ agencyId: '1', section: 'forsale', listings: 2 });
  });

  it('flags a bot check with a code the client can act on', async () => {
    const service = await build(new BotCheckScraper());
    const job = service.start('1', 'forsale');

    const finished = await settle(service, job.id);

    expect(finished.status).toBe('error');
    expect(finished.errorCode).toBe('BOT_CHECK');
    expect(finished.result).toBeNull();
  });
});
