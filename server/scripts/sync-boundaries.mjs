#!/usr/bin/env node
/**
 * Pulls Israeli boundaries from OpenStreetMap into the CityBoundary table: the
 * municipalities people search by, and the regions those municipalities sit in.
 *
 *   npm run boundaries:sync                 # municipalities and regions — the usual run
 *   npm run boundaries:sync -- --cities     # municipalities only
 *   npm run boundaries:sync -- --regions    # regions only, reusing the stored cities
 *   npm run boundaries:sync -- --level 10   # neighbourhoods, where coverage is thin
 *
 * Run occasionally, not on deploy. Overpass rate-limits anonymous callers and a
 * municipal boundary changes about never, so this is a maintenance task rather than
 * part of the application.
 *
 * Idempotent: cities upsert on the OSM relation id and regions on their name, so a
 * re-run updates in place. Everything a deployment needs is here — there is no step
 * that has to be done by hand against the database.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';
import { cityKey } from '../dist/listings/city-name.js';
import { pointInGeometry } from '../dist/listings/point-in-polygon.js';
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

const onlyCities = process.argv.includes('--cities');
const onlyRegions = process.argv.includes('--regions');
const doCities = !onlyRegions;
const doRegions = !onlyCities;

/**
 * The regions people search by, each one a set of sub-districts (נפות).
 *
 * Israel has no official unit with these names. It has six מחוזות and fifteen נפות; the
 * regions an estate agent or a buyer actually says — "מרכז והשרון", "חיפה והקריות" —
 * are commercial groupings that match neither. The נפות are the right material to build
 * them from: they tile the country exactly, so a region is the union of whole units
 * with no gaps, no overlaps and no geometry to compute beyond collecting polygons.
 *
 * This table is the whole definition. Renaming a region or moving a נפה between two of
 * them is an edit here and another run — there is nothing else to change.
 *
 * Names are matched with the same normalisation cities use, so `נפת רמת הגולן` and
 * `נפת רמת־הגולן` are the same key.
 */
const REGIONS = [
  { name: 'תל אביב והסביבה', parts: ['נפת תל אביב'] },
  { name: 'מרכז והשרון', parts: ['נפת השרון', 'נפת פתח תקווה'] },
  { name: 'שפלה', parts: ['נפת רמלה', 'נפת רחובות'] },
  { name: 'ירושלים והסביבה', parts: ['נפת ירושלים'] },
  { name: 'חיפה והקריות', parts: ['נפת חיפה'] },
  { name: 'חדרה והעמקים', parts: ['נפת חדרה', 'נפת יזרעאל'] },
  { name: 'צפון והגליל', parts: ['נפת עכו', 'נפת צפת', 'נפת כנרת', 'נפת רמת הגולן'] },
  { name: 'דרום', parts: ['נפת אשקלון', 'נפת באר שבע'] },
  // The only one not built from נפות: OSM carries it as a single admin_level=4 unit.
  { name: 'יהודה ושומרון', parts: ['יהודה ושומרון'], level: 4 },
];

/** Every OSM unit the regions above are built from, and at which level to look for it. */
const REQUIRED_PARTS = REGIONS.flatMap((region) =>
  region.parts.map((part) => ({ key: cityKey(part), level: region.level ?? 5 })),
);

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

const queryFor = (level) => `
[out:json][timeout:300];
relation["boundary"="administrative"]["admin_level"="${level}"](${ISRAEL_BBOX});
out geom;
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Overpass is free, heavily used and frequently busy — 502 and 504 from the main
 * instance are routine rather than exceptional, and were hit repeatedly while this was
 * written. So it retries across mirrors with a widening pause instead of failing the
 * run, which matters more in production, where nobody is watching to try again.
 */
async function fetchFromOverpass(level) {
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
          body: new URLSearchParams({ data: queryFor(level) }),
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

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const skipped = [];

/** The Hebrew name is what everything here matches on, so a relation without one is useless. */
const nameOf = (relation) => (relation.tags?.['name:he'] ?? relation.tags?.name ?? '').trim();

async function syncCities() {
  console.log(`\nMunicipalities (admin_level=${adminLevel}).\n`);

  const elements = await fetchFromOverpass(adminLevel);
  let written = 0;

  for (const relation of elements) {
    const name = nameOf(relation);
    if (!name) {
      skipped.push(`relation ${relation.id}: no name`);
      continue;
    }

    const geometry = toGeometry(relation);
    if (!geometry) {
      skipped.push(`${name}: rings would not close`);
      continue;
    }

    const row = {
      // Kept verbatim for display; `matchKey` is what the lookup compares.
      name,
      matchKey: cityKey(name),
      nameEn: relation.tags?.['name:en'] ?? null,
      kind: 'city',
      adminLevel,
      geometry,
      ...boundsOf(geometry),
      syncedAt: new Date(),
    };

    // Two relations can normalise to the same key — a council and a town of the same
    // name. The first wins and the clash is reported rather than silently overwriting,
    // because which one is right is a judgement, not a default.
    const clash = await prisma.cityBoundary.findUnique({
      where: { kind_matchKey: { kind: 'city', matchKey: row.matchKey } },
    });
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

  console.log(`\n✓ ${written} municipalities stored`);
}

/**
 * A point inside a city, for deciding which region it belongs to.
 *
 * The centre of the bounding box, which for an irregular outline — a coastal city, one
 * wrapped around a neighbour — can fall outside the city itself. So it is tested, and a
 * vertex of the outline is used when it misses. A vertex sits exactly on the border
 * between two regions only if the city does, which no Israeli municipality does.
 */
function insidePoint(boundary) {
  const centre = [(boundary.minLng + boundary.maxLng) / 2, (boundary.minLat + boundary.maxLat) / 2];
  if (pointInGeometry(centre[0], centre[1], boundary.geometry)) return centre;

  const rings =
    boundary.geometry.type === 'Polygon'
      ? boundary.geometry.coordinates
      : boundary.geometry.coordinates.flat();

  return rings[0]?.[0] ?? centre;
}

async function syncRegions() {
  console.log('\nRegions.\n');

  // Only the levels the table above actually needs, so a run does not fetch a level no
  // region is built from.
  const levels = [...new Set(REQUIRED_PARTS.map((part) => part.level))].sort();
  const parts = new Map();

  for (const level of levels) {
    for (const relation of await fetchFromOverpass(level)) {
      const name = nameOf(relation);
      if (!name) continue;

      const key = cityKey(name);
      if (!REQUIRED_PARTS.some((part) => part.key === key && part.level === level)) continue;

      const geometry = toGeometry(relation);
      if (!geometry) {
        skipped.push(`${name}: rings would not close`);
        continue;
      }

      parts.set(key, { name, geometry });
    }
  }

  // Every city already stored, so each region can be told which ones it covers.
  const cities = await prisma.cityBoundary.findMany({
    where: { kind: 'city' },
    select: { name: true, geometry: true, minLat: true, maxLat: true, minLng: true, maxLng: true },
  });

  let written = 0;

  for (const region of REGIONS) {
    const pieces = region.parts.map((part) => parts.get(cityKey(part))).filter(Boolean);

    if (pieces.length !== region.parts.length) {
      const missing = region.parts.filter((part) => !parts.has(cityKey(part)));
      skipped.push(`${region.name}: OpenStreetMap had no ${missing.join(', ')}`);
      continue;
    }

    // A MultiPolygon of whole sub-districts rather than a true union. They tile without
    // overlapping, so the outline is the same shape either way, and keeping the parts
    // whole means no polygon arithmetic to get subtly wrong.
    const polygons = pieces.flatMap((piece) =>
      piece.geometry.type === 'Polygon' ? [piece.geometry.coordinates] : piece.geometry.coordinates,
    );
    const geometry = { type: 'MultiPolygon', coordinates: polygons };

    // Worked out here rather than at query time: a search for a region is then an
    // ordinary `city IN (…)`, with no geometry in the request path at all.
    const memberCities = cities
      .filter((city) => {
        const [lng, lat] = insidePoint(city);
        return pointInGeometry(lng, lat, geometry);
      })
      .map((city) => city.name)
      .sort();

    const matchKey = cityKey(region.name);
    const row = {
      name: region.name,
      matchKey,
      nameEn: null,
      kind: 'district',
      adminLevel: region.level ?? 5,
      geometry,
      memberCities,
      ...boundsOf(geometry),
      syncedAt: new Date(),
    };

    await prisma.cityBoundary.upsert({
      where: { kind_matchKey: { kind: 'district', matchKey } },
      create: row,
      update: row,
    });

    console.log(`  ${region.name}: ${memberCities.length} cities`);
    written++;
  }

  console.log(`\n✓ ${written} regions stored`);
}

if (doCities) await syncCities();
if (doRegions) await syncRegions();

if (skipped.length > 0) {
  console.log(`\n  ${skipped.length} skipped:`);
  for (const line of skipped.slice(0, 10)) console.log(`    ${line}`);
  if (skipped.length > 10) console.log(`    … and ${skipped.length - 10} more`);
}
console.log();

await prisma.$disconnect();
