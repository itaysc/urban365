#!/usr/bin/env node
/**
 * Pulls every street in Israel into the `Street` table, from the Interior Ministry's
 * list published on data.gov.il.
 *
 *   npm run streets:sync
 *
 * Run occasionally, not on deploy: a street is named once and keeps its name. Idempotent
 * — rows upsert on (city, street), so a re-run updates in place and a renamed street
 * arrives as a new row rather than a duplicate of the old one.
 *
 * The locality names here come from the same register as `cities.ts`, so they already
 * agree with what the form sends. `cityKey` is stored anyway, because that is what the
 * lookup compares and a hyphen is exactly the kind of thing that changes between
 * publications of the same register.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cityKey } from '../dist/listings/city-name.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** "רשימת רחובות ישראל", the CSV resource that the publisher keeps updated. */
const RESOURCE = '9ad3862c-8391-4b2f-84a4-2d4c68625f4b';
const ENDPOINT = 'https://data.gov.il/api/3/action/datastore_search';
const PAGE = 5000;

/**
 * The code the register uses for "this locality has no streets" — a village where an
 * address is the village's own name. Not a street, and offering it as one would mean
 * suggesting `אבו גוש` to somebody who has already said they live in אבו גוש.
 */
const NO_STREET_CODE = 9000;

function readEnv() {
  const out = {};
  try {
    for (const line of readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
      const m = /^\s*([A-Z_0-9]+)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Falls through to process.env, which is how CI would supply it.
  }
  return out;
}

async function* records() {
  for (let offset = 0; ; offset += PAGE) {
    const url = `${ENDPOINT}?resource_id=${RESOURCE}&limit=${PAGE}&offset=${offset}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'nadlan-street-import/1.0 (one-off reference data import)' },
    });
    if (!response.ok) throw new Error(`data.gov.il → ${response.status}`);

    const { result } = await response.json();
    if (!result?.records?.length) return;

    yield result.records;
    process.stdout.write(`\r  ${Math.min(offset + PAGE, result.total)} / ${result.total}`);
    if (offset + PAGE >= result.total) return;
  }
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  if (!env.DATABASE_URL) {
    console.error('\nDATABASE_URL is not set.\n');
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

  console.log('Fetching streets from data.gov.il…');
  const rows = new Map();

  for await (const page of records()) {
    for (const record of page) {
      const city = String(record['שם_ישוב'] ?? '').trim();
      const name = String(record['שם_רחוב'] ?? '').trim();
      const code = Number(record['סמל_רחוב']);

      if (!city || !name || code === NO_STREET_CODE) continue;

      // Keyed here rather than deduped by the database: the register has a handful of
      // rows that differ only in a code, and one insert each would mean a conflict per
      // street on every run.
      rows.set(`${cityKey(city)}|${name}`, {
        city,
        cityKey: cityKey(city),
        name,
        code: Number.isFinite(code) ? code : null,
      });
    }
  }

  console.log(`\n${rows.size} streets.`);
  if (rows.size < 50_000) {
    throw new Error('Far fewer streets than the register holds — refusing to write.');
  }

  const all = [...rows.values()];
  let written = 0;

  // createMany + skipDuplicates rather than an upsert each: 63,000 round trips take
  // minutes, and nothing here changes except by a street being added.
  for (let i = 0; i < all.length; i += 2000) {
    const chunk = all.slice(i, i + 2000);
    const { count } = await prisma.street.createMany({ data: chunk, skipDuplicates: true });
    written += count;
    process.stdout.write(`\r  writing ${Math.min(i + 2000, all.length)} / ${all.length}`);
  }

  const total = await prisma.street.count();
  console.log(`\n${written} new, ${total} in the table.`);
  await prisma.$disconnect();
}

await main();
