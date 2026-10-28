/**
 * Loads the JSON scrape caches in data/agencies into Postgres.
 *
 * One-off migration for data collected before the database existed, and still useful
 * for replaying a saved payload after a mapping change without re-scraping yad2.
 *
 *   npm run import:cache
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { AppModule } from '../app.module.js';
import { AgencyRepository } from '../yad2/agency.repository.js';
import { SECTIONS, type AgencyDump, type Section } from '../yad2/yad2.types.js';

interface CachedDump {
  dump: AgencyDump;
  scrapedAt: string;
}

async function main() {
  const logger = new Logger('ImportCache');
  const dir = process.env.YAD2_CACHE_DIR ?? path.resolve(process.cwd(), 'data/agencies');

  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    logger.warn(`No cache directory at ${dir} — nothing to import.`);
    return;
  }

  if (files.length === 0) {
    logger.warn(`No .json files in ${dir} — nothing to import.`);
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const repository = app.get(AgencyRepository);

  let imported = 0;
  for (const file of files) {
    // Files are named <agencyId>-<section>.json.
    const match = file.replace(/\.json$/, '').match(/^(.+)-(forsale|rent|commercial)$/);
    if (!match) {
      logger.warn(`Skipping ${file}: name is not <agencyId>-<section>.json`);
      continue;
    }

    const [, agencyId, section] = match;
    if (!SECTIONS.includes(section as Section)) continue;

    try {
      const cached = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as CachedDump;
      await repository.saveDump(cached.dump, agencyId, section as Section);
      imported++;
    } catch (e) {
      logger.error(`Failed on ${file}: ${(e as Error).message}`);
    }
  }

  logger.log(`Imported ${imported} of ${files.length} cache file(s).`);
  await app.close();
}

await main();
