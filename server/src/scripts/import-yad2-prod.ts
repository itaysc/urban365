/**
 * Imports a Yad2 page into production from this machine.
 *
 * The site button runs on the server, and that server cannot see the Chrome on this
 * computer. This process attaches to the local Chrome and writes the listings into the
 * office of a user you pick, through the same save path the site uses.
 *
 * Listing photos are left out unless `--images` is passed. With that flag, each
 * photo is copied into the agency's own folder in storage. A logo is never copied.
 * A listing already stored under the same Yad2 token is updated, and one that
 * already has photos is left as it is.
 *
 * Chrome has to be listening on port 9222 and already showing yad2 (npm run chrome:debug
 * from the repo root). The database comes from server/.prod.env.
 *
 *   npm run import:yad2
 *   npm run import:yad2:images
 *
 * Both ask which user and which section. Neither picks a user for you.
 *   npm run import:yad2 --prefix server -- --email someone@example.com --section forsale --yes
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { normalizeEmail } from '../auth/normalize-email.js';
import configuration from '../config/configuration.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { StorageService } from '../storage/storage.service.js';
import { AgencyRepository } from '../yad2/agency.repository.js';
import { copyYad2ListingImages } from '../yad2/import-listing-images.js';
import { Yad2Module } from '../yad2/yad2.module.js';
import { Yad2Service } from '../yad2/yad2.service.js';
import { parseAgencyInput } from '../yad2/yad2.transform.js';
import { SECTIONS, type AgencyDump, type Section } from '../yad2/yad2.types.js';

const CDP_URL = 'http://127.0.0.1:9222';
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Only what the scrape needs. The full app would also start the mail and match timers. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    StorageModule,
    Yad2Module,
  ],
})
class ProdImportModule {}

interface Office {
  id: string;
  name: string;
  yad2Id: string | null;
  status: string;
  role: string;
}

interface Candidate {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  offices: Office[];
}

function loadProdEnv(): void {
  const envPath = path.join(serverRoot, '.prod.env');
  let text: string;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    console.error(`Missing ${envPath}. Copy the Railway Postgres URLs into it first.`);
    process.exit(1);
  }

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }

  // The Chrome is on this machine. A URL from the file would point the scrape elsewhere.
  process.env.YAD2_CDP_URL = CDP_URL;
}

function isLocalDb(url: string | undefined): boolean {
  return !url || /localhost|127\.0\.0\.1|REPLACE_ME/.test(url);
}

function dbHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(unparsed database url)';
  }
}

async function assertChrome(): Promise<void> {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    console.error(
      `Chrome is not listening on ${CDP_URL}.\n` +
        'From the repo root run: npm run chrome:debug\n' +
        'Open yad2 in that window and pass the check, then run this again.',
    );
    process.exit(1);
  }
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

function parseSections(value: string | undefined): Section[] | null {
  if (!value) return null;
  if (value === 'all') return [...SECTIONS];
  if ((SECTIONS as string[]).includes(value)) return [value as Section];
  return null;
}

async function loadCandidates(prisma: PrismaService): Promise<Candidate[]> {
  const rows = await prisma.user.findMany({
    where: {
      disabledAt: null,
      memberships: { some: { status: 'active', agency: { status: { not: 'deleted' } } } },
    },
    orderBy: { email: 'asc' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      memberships: {
        where: { status: 'active', agency: { status: { not: 'deleted' } } },
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          agency: { select: { id: true, name: true, yad2Id: true, status: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    offices: row.memberships.map((membership) => ({
      id: membership.agency.id,
      name: membership.agency.name,
      yad2Id: membership.agency.yad2Id,
      status: membership.agency.status,
      role: membership.role,
    })),
  }));
}

function describe(person: Candidate, office: Office): string {
  const who = `${person.firstName} ${person.lastName} <${person.email}>`;
  const page = office.yad2Id ? `yad2 ${office.yad2Id}` : 'no yad2 page yet';
  return `${who} · ${office.name} (${office.status}, ${office.role}) · ${page}`;
}

async function pickPerson(candidates: Candidate[], email: string | undefined): Promise<Candidate> {
  if (email) {
    const normalized = normalizeEmail(email);
    const found = candidates.find((person) => person.email === normalized);
    if (!found) throw new Error(`No active office for ${normalized}.`);
    return found;
  }

  candidates.forEach((person, index) => {
    const office = person.offices[0];
    const extra = person.offices.length > 1 ? ` · +${person.offices.length - 1} more offices` : '';
    console.log(`${String(index + 1).padStart(3)}  ${describe(person, office)}${extra}`);
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await rl.question('Number or email: ')).trim();
      const asNumber = Number(answer);
      if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= candidates.length) {
        return candidates[asNumber - 1];
      }
      const byEmail = candidates.find((person) => person.email === normalizeEmail(answer));
      if (byEmail) return byEmail;
      console.log('Not in the list.');
    }
  } finally {
    rl.close();
  }
}

async function pickOffice(person: Candidate): Promise<Office> {
  if (person.offices.length === 1) return person.offices[0];
  if (!process.stdin.isTTY) {
    throw new Error(`${person.email} has ${person.offices.length} offices. Run this in a terminal to choose one.`);
  }

  person.offices.forEach((office, index) => {
    const page = office.yad2Id ? `yad2 ${office.yad2Id}` : 'no yad2 page yet';
    console.log(`${index + 1}  ${office.name} (${office.status}, ${office.role}) · ${page}`);
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = Number((await rl.question('Which office: ')).trim());
      if (Number.isInteger(answer) && answer >= 1 && answer <= person.offices.length) {
        return person.offices[answer - 1];
      }
      console.log('Not in the list.');
    }
  } finally {
    rl.close();
  }
}

async function ensureYad2Id(prisma: PrismaService, office: Office): Promise<string> {
  if (office.yad2Id) return office.yad2Id;
  if (!process.stdin.isTTY) {
    throw new Error(`${office.name} is not linked to a yad2 page. Run this in a terminal to link one.`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const input = (await rl.question(`Yad2 number or URL for ${office.name}: `)).trim();
      let yad2Id: string;
      try {
        yad2Id = parseAgencyInput(input).agencyId;
      } catch (e) {
        console.log((e as Error).message);
        continue;
      }

      const taken = await prisma.agency.findUnique({
        where: { yad2Id },
        select: { id: true, name: true },
      });
      if (taken && taken.id !== office.id) {
        console.log(`That page is already linked to ${taken.name}.`);
        continue;
      }

      await prisma.agency.update({ where: { id: office.id }, data: { yad2Id } });
      console.log(`Linked ${office.name} to yad2 ${yad2Id}.`);
      return yad2Id;
    }
  } finally {
    rl.close();
  }
}

async function pickSections(preset: Section[] | null): Promise<Section[]> {
  if (preset) return preset;

  console.log('1  forsale');
  console.log('2  rent');
  console.log('3  commercial');
  console.log('4  all three');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await rl.question('Section [1]: ')).trim();
      if (answer === '' || answer === '1') return ['forsale'];
      if (answer === '2') return ['rent'];
      if (answer === '3') return ['commercial'];
      if (answer === '4') return [...SECTIONS];
      console.log('Type 1, 2, 3, or 4.');
    }
  } finally {
    rl.close();
  }
}

async function confirm(
  host: string,
  person: Candidate,
  office: Office,
  yad2Id: string,
  sections: Section[],
  withImages: boolean,
  skip: boolean,
): Promise<boolean> {
  console.log(
    `\nThis writes into PRODUCTION (${host}) for ${describe(person, { ...office, yad2Id })}.\n` +
      `Sections: ${sections.join(', ')}. Listings that left that Yad2 page are marked delisted.` +
      (withImages
        ? `\nPhotos are copied into agencies/${office.id}/listings/ in storage. Listings that already have photos are skipped.`
        : ''),
  );
  if (skip) return true;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question('Type yes to continue: ')).trim();
    if (answer !== 'yes') {
      console.log('Cancelled.');
      return false;
    }
    return true;
  } finally {
    rl.close();
  }
}

async function runSection(
  yad2: Yad2Service,
  yad2Id: string,
  section: Section,
  withImages: boolean,
): Promise<void> {
  const job = yad2.start(yad2Id, section, { preserveProfile: true, retainImageUrls: withImages });
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

  if (job.status === 'error') {
    throw new Error(job.error ?? `${section} failed`);
  }

  const total = job.result?.meta.total ?? 0;
  console.log(`${section}: ${total} listing(s) saved.`);
}

/** Writes a scrape that already finished, when the database save was the part that failed. */
async function saveCached(repository: AgencyRepository, yad2Id: string, section: Section): Promise<void> {
  const file = path.join(serverRoot, 'data', 'agencies', `${yad2Id}-${section}.json`);
  let cached: { dump: AgencyDump };
  try {
    cached = JSON.parse(await readFile(file, 'utf8')) as { dump: AgencyDump };
  } catch {
    throw new Error(`No saved scrape at ${file}. Run without --from-cache to fetch it.`);
  }
  await repository.saveDump(cached.dump, yad2Id, section, { preserveProfile: true });
  console.log(`${section}: wrote the saved scrape (${cached.dump.feed.length} cards).`);
}

async function main(): Promise<void> {
  const logger = new Logger('ImportYad2Prod');
  const args = process.argv.slice(2);
  const email = argValue(args, '--email');
  const sections = parseSections(argValue(args, '--section'));
  const skipConfirm = args.includes('--yes');
  const fromCache = args.includes('--from-cache');
  const withImages = args.includes('--images');

  if (args.includes('--section') && !sections) {
    logger.error('Section must be forsale, rent, commercial, or all.');
    process.exitCode = 1;
    return;
  }
  if (!process.stdin.isTTY && (!email || !sections || !skipConfirm)) {
    logger.error('Usage: npm run import:yad2 -- --email <email> --section forsale|rent|commercial|all --yes');
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

  process.chdir(serverRoot);
  const app = await NestFactory.createApplicationContext(ProdImportModule, { logger: ['error', 'warn', 'log'] });

  try {
    const prisma = app.get(PrismaService);
    const yad2 = app.get(Yad2Service);
    const repository = app.get(AgencyRepository);
    const storage = app.get(StorageService);
    if (withImages && !storage.isConfigured()) {
      logger.error('Storage is not configured in server/.prod.env, so photos cannot be copied.');
      process.exitCode = 1;
      return;
    }
    const candidates = await loadCandidates(prisma);
    if (candidates.length === 0) {
      logger.error('No user with an active office.');
      process.exitCode = 1;
      return;
    }

    const person = await pickPerson(candidates, email);
    const office = await pickOffice(person);
    const yad2Id = await ensureYad2Id(prisma, office);
    const chosen = await pickSections(sections);
    const host = dbHost(databaseUrl ?? '');
    const proceed = await confirm(host, person, office, yad2Id, chosen, withImages, skipConfirm);
    if (!proceed) return;

    for (const section of chosen) {
      if (fromCache) await saveCached(repository, yad2Id, section);
      else await runSection(yad2, yad2Id, section, withImages);
      if (!withImages) continue;

      const cached = JSON.parse(
        await readFile(path.join(serverRoot, 'data', 'agencies', `${yad2Id}-${section}.json`), 'utf8'),
      ) as { dump: AgencyDump };
      const photos = await copyYad2ListingImages(prisma, storage, cached.dump, yad2Id);
      if (photos.uploaded + photos.skipped + photos.failed === 0) {
        logger.warn(`${section}: the saved scrape has no photo addresses. Run a live import with --images.`);
      }
      logger.log(
        `${section} photos: ${photos.uploaded} stored on ${photos.listings} listing(s), ${photos.skipped} already had photos, ${photos.failed} failed.`,
      );
    }
    logger.log('Done.');
  } catch (e) {
    logger.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

await main();
