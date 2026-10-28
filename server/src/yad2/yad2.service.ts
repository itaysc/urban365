import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgencyCacheService } from './agency-cache.service.js';
import { AgencyRepository } from './agency.repository.js';
import { BotCheckError, Yad2ScraperService, type ScrapeProgress } from './yad2-scraper.service.js';
import { parseAgencyInput, toResult } from './yad2.transform.js';
import type { AgencyResult, Section } from './yad2.types.js';

/** `BOT_CHECK` is the one the caller can act on, so the client renders it differently. */
export type JobErrorCode = 'BOT_CHECK' | 'SCRAPE_FAILED';

export interface Job {
  id: string;
  agencyId: string;
  section: Section;
  status: 'running' | 'done' | 'error';
  progress: ScrapeProgress;
  error: string | null;
  errorCode: JobErrorCode | null;
  result: AgencyResult | null;
  startedAt: string;
  finishedAt: string | null;
}

/** A scrape outlives a request, so it runs as a job the client polls. */
@Injectable()
export class Yad2Service {
  private readonly logger = new Logger(Yad2Service.name);
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly scraper: Yad2ScraperService,
    private readonly cache: AgencyCacheService,
    private readonly repository: AgencyRepository,
  ) {}

  parseInput(input: string): { agencyId: string; section: Section | null } {
    return parseAgencyInput(input);
  }

  /** Postgres is the store; the JSON files are only a raw backup of each run. */
  async getCached(agencyId: string, section: Section): Promise<AgencyResult | null> {
    return this.repository.getAgency(agencyId, section);
  }

  listCached() {
    return this.repository.listAgencies();
  }

  /** Starts a scrape and returns immediately; poll `getJob` for progress. */
  start(agencyId: string, section: Section): Job {
    const job: Job = {
      id: randomUUID(),
      agencyId,
      section,
      status: 'running',
      progress: { phase: 'starting', pagesDone: 0, pagesTotal: 0, itemsDone: 0, itemsTotal: 0, done: 0, total: 0 },
      error: null,
      errorCode: null,
      result: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.jobs.set(job.id, job);

    void this.run(job);
    return job;
  }

  private async run(job: Job): Promise<void> {
    try {
      const dump = await this.scraper.scrape(job.agencyId, job.section, (p) => {
        job.progress = p;
      });
      // Keep the untouched payload on disk as well, so a mapping bug can be replayed
      // without re-scraping yad2.
      const cached = await this.cache.write(job.agencyId, job.section, dump);
      await this.repository.saveDump(dump, job.agencyId, job.section);
      job.result = toResult(dump, job.agencyId, job.section, 'live', cached.scrapedAt);
      job.status = 'done';
    } catch (e) {
      job.status = 'error';
      job.errorCode = e instanceof BotCheckError ? 'BOT_CHECK' : 'SCRAPE_FAILED';
      job.error =
        e instanceof BotCheckError
          ? e.message
          : `Scrape failed: ${e instanceof Error ? e.message : String(e)}`;
      this.logger.error(job.error);
    } finally {
      job.finishedAt = new Date().toISOString();
      // Keep finished jobs briefly so a slow poll still sees the outcome.
      setTimeout(() => this.jobs.delete(job.id), 10 * 60_000).unref();
    }
  }

  getJob(id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException(`No job ${id} — it may have expired.`);
    return job;
  }
}
