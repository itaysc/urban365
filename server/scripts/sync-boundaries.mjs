#!/usr/bin/env node
/**
 * Pulls Israeli municipal boundaries from OpenStreetMap into the CityBoundary table.
 *
 *   npm run boundaries:sync             # municipalities (admin_level=8)
 *   npm run boundaries:sync -- --level 10   # neighbourhoods, where coverage is thin
 *
 * Run occasionally, not on deploy. Overpass rate-limits anonymous callers and a
 * municipal boundary changes about never, so this is a maintenance task rather than
 * part of the application.
 *
 * Idempotent: rows are upserted on the OSM relation id, so a re-run updates in place.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';
import { cityKey } from '../dist/listings/city-name.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const env = { ...readEnv(), ...process.env };
const connectionString = env.DATABASE_URL;
if (!connectionString) {
  console.error('\nDATABASE_URL is not set.\n');
  process.exit(1);
}

const levelArg = process.argv.indexOf('--level');
const adminLevel = levelArg === -1 ? 8 : Number(process.argv[levelArg + 1]);

// Mirrors are listed because the main instance refuses anonymous callers under load —
// it did exactly that while this was being written.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

/**
 * A bounding box rather than `area["ISO3166-1"="IL"]`. The area form depends on the
 * mirror having built its area index, and one of them answered HTTP 200 with zero
 * relations because it had not — a silent empty result, which is worse than an error.
 * The box covers Israel and the territories; anything outside is filtered by name
 * later anyway.
 */
const ISRAEL_BBOX = '29.45,34.20,33.35,35.95';

const query = `
[out:json][timeout:300];
relation["boundary"="administrative"]["admin_level"="${adminLevel}"](${ISRAEL_BBOX});
out geom;
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Overpass is free, heavily used and frequently busy — 502 and 504 from the main
 * instance are routine rather than exceptional, and were hit repeatedly while this was
 * written. So it retries across mirrors with a widening pause instead of failing the
 * run, which matters more in production, where nobody is watching to try again.
 */
async function fetchFromOverpass() {
  const ROUNDS = 4;
  let lastError;

  for (let round = 1; round <= ROUNDS; round++) {
    for (const endpoint of ENDPOINTS) {
      process.stdout.write(`  [${round}/${ROUNDS}] ${new URL(endpoint).host} … `);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // Overpass asks callers to identify themselves, and anonymous traffic is
            // the first thing throttled.
            'User-Agent': 'nadlan-boundaries-sync/1.0 (one-off admin boundary import)',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(300_000),
        });

        if (!response.ok) {
          console.log(`HTTP ${response.status}`);
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        const body = await response.json();
        const elements = body.elements ?? [];

        // An empty result is treated as a failure, not an answer: Israel has hundreds
        // of municipalities, so zero means the mirror could not serve the query rather
        // than that there are none.
        if (elements.length === 0) {
          console.log('0 relations — treating as a failure');
          lastError = new Error('empty result');
          continue;
        }

        console.log(`${elements.length} relations`);
        return elements;
      } catch (e) {
        console.log(e.name === 'TimeoutError' ? 'timed out' : e.message);
        lastError = e;
      }
    }

    if (round < ROUNDS) {
      const wait = round * 20;
      console.log(`  every mirror refused; waiting ${wait}s before round ${round + 1}`);
      await sleep(wait * 1000);
    }
  }

  throw new Error(
    `Overpass would not answer after ${ROUNDS} rounds (last: ${lastError?.message}). ` +
      'It is usually transient — try again in a few minutes.',
  );
}

/**
 * Turns a relation's member ways into closed rings.
 *
 * An OSM boundary is not a polygon — it is a bag of way fragments in arbitrary order
 * and arbitrary direction. Rings are built by walking: take a fragment, then repeatedly
 * find one that starts or ends where the current ring ends, reversing it if needed,
 * until the ring closes on itself.
 */
function assembleRings(ways) {
  const open = ways.map((w) => w.geometry.map((p) => [p.lon, p.lat])).filter((w) => w.length > 1);
  const rings = [];

  const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

  while (open.length > 0) {
    let ring = open.shift();

    let joined = true;
    while (joined && !samePoint(ring[0], ring[ring.length - 1])) {
      joined = false;

      for (let i = 0; i < open.length; i++) {
        const candidate = open[i];
        const end = ring[ring.length - 1];

        if (samePoint(end, candidate[0])) {
          ring = ring.concat(candidate.slice(1));
        } else if (samePoint(end, candidate[candidate.length - 1])) {
          ring = ring.concat(candidate.slice(0, -1).reverse());
        } else if (samePoint(ring[0], candidate[candidate.length - 1])) {
          ring = candidate.slice(0, -1).concat(ring);
        } else if (samePoint(ring[0], candidate[0])) {
          ring = candidate.slice(1).reverse().concat(ring);
        } else {
          continue;
        }

        open.splice(i, 1);
        joined = true;
        break;
      }
    }

    // A fragment that never closed is a gap in the source data — skipped rather than
    // emitted, because an unclosed ring renders as a stray line across the map.
    if (samePoint(ring[0], ring[ring.length - 1]) && ring.length >= 4) rings.push(ring);
  }

  return rings;
}

/** Shoelace area, to tell the enclosing ring from a hole. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum / 2);
}

function toGeometry(relation) {
  const outer = relation.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry);
  const rings = assembleRings(outer);
  if (rings.length === 0) return null;

  // Several rings means an exclave — Israeli municipalities have them — so it is a
  // MultiPolygon. Largest first, which is what a renderer expects.
  rings.sort((a, b) => ringArea(b) - ringArea(a));

  return rings.length === 1
    ? { type: 'Polygon', coordinates: [rings[0]] }
    : { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) };
}

function boundsOf(geometry) {
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }

  return { minLat, maxLat, minLng, maxLng };
}

console.log(`\nSyncing admin_level=${adminLevel} boundaries for Israel.\n`);

const elements = await fetchFromOverpass();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let written = 0;
const skipped = [];

for (const relation of elements) {
  // The Hebrew name is what listings carry, so a relation without one cannot be matched
  // to anything and is not worth storing.
  const name = (relation.tags?.['name:he'] ?? relation.tags?.name ?? '').trim();
  if (!name) {
    skipped.push(`relation ${relation.id}: no name`);
    continue;
  }

  const geometry = toGeometry(relation);
  if (!geometry) {
    skipped.push(`${name}: rings would not close`);
    continue;
  }

  const bounds = boundsOf(geometry);

  const row = {
    // Kept verbatim for display; `matchKey` is what the lookup compares.
    name,
    matchKey: cityKey(name),
    nameEn: relation.tags?.['name:en'] ?? null,
    adminLevel,
    geometry,
    ...bounds,
    syncedAt: new Date(),
  };

  // Two relations can normalise to the same key — a council and a town of the same
  // name. The first wins and the clash is reported rather than silently overwriting,
  // because which one is right is a judgement, not a default.
  const clash = await prisma.cityBoundary.findUnique({ where: { matchKey: row.matchKey } });
  if (clash && clash.osmRelationId !== BigInt(relation.id)) {
    skipped.push(`${name}: key "${row.matchKey}" already taken by ${clash.name}`);
    continue;
  }

  await prisma.cityBoundary.upsert({
    where: { osmRelationId: BigInt(relation.id) },
    create: { osmRelationId: BigInt(relation.id), ...row },
    update: row,
  });

  written++;
}

console.log(`\n✓ ${written} boundaries stored`);
if (skipped.length > 0) {
  console.log(`  ${skipped.length} skipped:`);
  for (const line of skipped.slice(0, 10)) console.log(`    ${line}`);
  if (skipped.length > 10) console.log(`    … and ${skipped.length - 10} more`);
}
console.log();

await prisma.$disconnect();
