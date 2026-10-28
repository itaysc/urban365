import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AgencyDump, Section } from './yad2.types.js';

export interface CachedDump {
  dump: AgencyDump;
  scrapedAt: string;
}

/**
 * Scraping an agency takes a couple of minutes, so every run is written to disk and
 * served again until the caller explicitly asks to refresh.
 */
@Injectable()
export class AgencyCacheService {
  private readonly logger = new Logger(AgencyCacheService.name);
  private readonly dir: string;

  constructor(config: ConfigService) {
    this.dir = config.get<string>('yad2.cacheDir') ?? path.resolve(process.cwd(), 'data/agencies');
  }

  private file(agencyId: string, section: Section): string {
    return path.join(this.dir, `${agencyId}-${section}.json`);
  }

  async read(agencyId: string, section: Section): Promise<CachedDump | null> {
    try {
      return JSON.parse(await readFile(this.file(agencyId, section), 'utf8')) as CachedDump;
    } catch {
      return null;
    }
  }

  async write(agencyId: string, section: Section, dump: AgencyDump): Promise<CachedDump> {
    const cached: CachedDump = { dump, scrapedAt: new Date().toISOString() };
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(agencyId, section), JSON.stringify(cached), 'utf8');
    this.logger.log(`Cached ${agencyId}/${section} (${dump.items.length} listings)`);
    return cached;
  }

  /** Everything already collected, for the "recently scraped" list on the search page. */
  async list(): Promise<{ agencyId: string; section: Section; name: string; total: number; scrapedAt: string }[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }

    const entries = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const [agencyId, section] = f.replace(/\.json$/, '').split('-');
          const cached = await this.read(agencyId, section as Section);
          if (!cached) return null;
          return {
            agencyId,
            section: section as Section,
            name: cached.dump.agency.details?.officeName ?? agencyId,
            total: cached.dump.feed.length,
            scrapedAt: cached.scrapedAt,
          };
        }),
    );

    return entries
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => b.scrapedAt.localeCompare(a.scrapedAt));
  }
}
