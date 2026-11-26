/**
 * Fills an office nobody has claimed from its Yad2 page, privately, and prints the
 * link that office can open to see it.
 *
 * The office is saved as unclaimed and every listing as a draft: none of it is on the
 * site, in search or in the sitemap. No photos are copied. When someone from the
 * office signs up through the link and you approve them, the drafts are published.
 *
 * An office that already has an approved account is refused; use npm run import:yad2
 * for that, which writes into their live office.
 *
 * Chrome has to be listening on port 9222 and already showing yad2 (npm run chrome:debug
 * from the repo root). The database comes from server/.prod.env.
 *
 *   npm run import:preview
 *   npm run import:preview --prefix server -- --yad2 <number or url> --section all --yes
 *
 * Each link is also kept in data/agency-previews.json.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import configuration from '../config/configuration.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgencyRepository } from '../yad2/agency.repository.js';
import { Yad2Module } from '../yad2/yad2.module.js';
import { Yad2Service } from '../yad2/yad2.service.js';
import { parseAgencyInput } from '../yad2/yad2.transform.js';
import { SECTIONS, type AgencyDump, type Section } from '../yad2/yad2.types.js';
import { assertChrome, dbHost, isLocalDb, loadProdEnv, serverRoot } from './prod-env.js';

const SITE = 'https://urban365.co.il';
const previewsFile = path.resolve(serverRoot, '../data/agency-previews.json');

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), PrismaModule, Yad2Module],
})
class PreviewImportModule {}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

function parseSections(value: string | undefined): Section[] | null {
  if (!value || value === 'all') return [...SECTIONS];
  if ((SECTIONS as string[]).includes(value)) return [value as Section];
  return null;
}

/** Answers come from one interface: a second one on a pipe drops the line it was given. */
function asker(rl: Interface) {
  const lines = rl[Symbol.asyncIterator]();
  return async (prompt: string): Promise<string | null> => {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    return done ? null : (value as string).trim();
  };
}

async function runSection(yad2: Yad2Service, yad2Id: string, section: Section): Promise<number> {
  const job = yad2.start(yad2Id, section);
  let shown = '';
  while (job.status === 'running') {
    const progress = job.progress;
    const line = `${section}  ${progress.phase}  ${progress.done}/${progress.total || '?'}`;
    if (line !== shown) {
      process.stdout.write(`\r${line}`.padEnd(48));
      shown = line;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  process.stdout.write('\n');
  if (job.status === 'error') throw new Error(job.error ?? `${section} failed`);
  return job.result?.meta.total ?? 0;
}

async function saveCached(repository: AgencyRepository, yad2Id: string, section: Section): Promise<number> {
  const file = path.join(serverRoot, 'data', 'agencies', `${yad2Id}-${section}.json`);
  let cached: { dump: AgencyDump };
  try {
    cached = JSON.parse(await readFile(file, 'utf8')) as { dump: AgencyDump };
  } catch {
    throw new Error(`No saved scrape at ${file}. Run without --from-cache to fetch it.`);
  }
  await repository.saveDump(cached.dump, yad2Id, section);
  return cached.dump.feed.length;
}

function remember(entry: { yad2Id: string; name: string; url: string; listings: number }): void {
  let rows: unknown[] = [];
  if (existsSync(previewsFile)) {
    const raw = readFileSync(previewsFile, 'utf8').trim();
    if (raw) rows = JSON.parse(raw) as unknown[];
  }
  const previous = rows.find((row) => (row as { yad2Id?: string }).yad2Id === entry.yad2Id) as
    | { emails?: string[] }
    | undefined;
  const kept = rows.filter((row) => row !== previous);
  // The invite script ties addresses to the office here. A fresh import keeps them.
  kept.push({ ...entry, emails: previous?.emails ?? [], createdAt: new Date().toISOString() });
  writeFileSync(previewsFile, `${JSON.stringify(kept, null, 2)}\n`);
}

async function main(): Promise<void> {
  const logger = new Logger('ImportYad2Preview');
  const args = process.argv.slice(2);
  const sections = parseSections(argValue(args, '--section'));
  const skipConfirm = args.includes('--yes');
  const fromCache = args.includes('--from-cache');

  if (!sections) {
    logger.error('Section must be forsale, rent, commercial, or all.');
    process.exitCode = 1;
    return;
  }

  loadProdEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (isLocalDb(databaseUrl) || isLocalDb(process.env.APP_DATABASE_URL)) {
    logger.error('server/.prod.env still has a local or placeholder database URL.');
    process.exitCode = 1;
    return;
  }
  if (!fromCache) await assertChrome();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = asker(rl);
  process.chdir(serverRoot);
  const app = await NestFactory.createApplicationContext(PreviewImportModule, { logger: ['error', 'warn', 'log'] });

  try {
    const prisma = app.get(PrismaService);
    const yad2 = app.get(Yad2Service);
    const repository = app.get(AgencyRepository);

    let input = argValue(args, '--yad2') ?? null;
    let yad2Id: string | null = null;
    while (!yad2Id) {
      input ??= await ask('Yad2 office number or URL: ');
      if (input === null) throw new Error('No Yad2 office given.');
      try {
        yad2Id = parseAgencyInput(input).agencyId;
      } catch (e) {
        console.log((e as Error).message);
        input = null;
      }
    }

    const existing = await prisma.agency.findUnique({
      where: { yad2Id },
      select: { name: true, status: true },
    });
    if (existing && !['unclaimed', 'pending'].includes(existing.status)) {
      throw new Error(
        `${existing.name} is ${existing.status} here. A preview is only for an office nobody has claimed.` +
          (existing.status === 'active' ? ' Use npm run import:yad2 for their own office.' : ''),
      );
    }

    console.log(
      `\nThis writes into PRODUCTION (${dbHost(databaseUrl ?? '')}).\n` +
        `Yad2 office ${yad2Id}${existing ? ` (${existing.name}, ${existing.status})` : ''}, sections: ${sections.join(', ')}.\n` +
        'The office stays unclaimed and its listings are saved as drafts. Nothing is published. No photos are copied.',
    );
    if (!skipConfirm && (await ask('Type yes to continue: ')) !== 'yes') {
      console.log('Cancelled.');
      return;
    }

    for (const section of sections) {
      const total = fromCache ? await saveCached(repository, yad2Id, section) : await runSection(yad2, yad2Id, section);
      console.log(`${section}: ${total} listing(s).`);
    }

    const agency = await prisma.agency.findUniqueOrThrow({
      where: { yad2Id },
      select: { id: true, name: true, previewToken: true },
    });
    if (!agency.previewToken) throw new Error(`${agency.name} has no preview link. Nothing was saved for it.`);
    const drafts = await prisma.listing.count({
      where: { agencyId: agency.id, status: 'draft', delistedAt: null },
    });

    const url = `${SITE}/preview/${agency.previewToken}`;
    remember({ yad2Id, name: agency.name, url, listings: drafts });
    console.log(`\n${agency.name}: ${drafts} draft listing(s).\n${url}\n`);
  } catch (e) {
    logger.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    rl.close();
    await app.close();
  }
}

await main();
