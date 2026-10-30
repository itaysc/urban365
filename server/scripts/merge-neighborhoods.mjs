#!/usr/bin/env node
/**
 * Builds the neighbourhood list the publish form suggests from, out of two sources.
 *
 *   npm run neighborhoods:build
 *   npm run neighborhoods:build -- --offline   # reuse the last Overpass answer
 *
 * Neither source is enough on its own:
 *
 * * The Central Bureau of Statistics table (`extract-neighborhoods.py` turns it into
 *   `cbs-neighborhoods.json`) names neighbourhoods authoritatively, but only for the
 *   114 localities large enough to be split into statistical areas. Everywhere else is
 *   simply absent from it.
 * * OpenStreetMap has `place=suburb|neighbourhood|quarter` points in towns the CBS does
 *   not divide, and newer names in the ones it does — but it is a map, not a register:
 *   the points carry no city, so each one has to be placed inside a municipal boundary
 *   to find out which city it belongs to.
 *
 * Which is why this half needs the database: `CityBoundary` already holds those
 * boundaries, put there by `sync-boundaries.mjs`, and the same point-in-polygon test
 * that assigns a city to a region assigns a neighbourhood to a city.
 *
 * The CBS name wins on a tie, because it is the official spelling and the one a buyer
 * is most likely to type into a search.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cityKey } from '../dist/listings/city-name.js';
import { pointInGeometry } from '../dist/listings/point-in-polygon.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const CBS_JSON = path.join(here, 'cbs-neighborhoods.json');
const OSM_CACHE = path.join(here, 'osm-neighborhoods.json');
const TARGET = path.resolve(root, '../client/src/data/neighborhoods.ts');

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

const QUERY = `
[out:json][timeout:240];
area["ISO3166-1"="IL"][admin_level=2]->.il;
(
  node["place"~"^(suburb|neighbourhood|quarter)$"]["name"](area.il);
  way["place"~"^(suburb|neighbourhood|quarter)$"]["name"](area.il);
  relation["place"~"^(suburb|neighbourhood|quarter)$"]["name"](area.il);
);
out center tags;
`;

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

/**
 * Municipalities whose name in one source is not the name in the other.
 *
 * Mostly history: Israel merged a set of towns in the 2000s and split most of them
 * again, so the CBS table and the OSM boundaries each froze a different moment. Nazareth
 * Illit was renamed. Everything here is keyed and valued with `cityKey`, and only maps
 * names that are the same place — a town the picker cannot offer is dropped instead of
 * guessed at.
 */
const SAME_PLACE = {
  'באקה גת': 'באקה אל גרביה',
  'דלית אל כרמל': 'דאלית אל כרמל',
  יהוד: 'יהוד מונוסון',
  'כוכב יאיר': 'כוכב יאיר צור יגאל',
  מודיעין: 'מודיעין מכבים רעות',
  'נצרת עילית': 'נוף הגליל',
  'קריית אונו': 'קרית אונו',
  'קריית טבעון': 'קרית טבעון',
};

/** Hebrew, so the Arabic and English duplicates OSM also carries are left out. */
const isHebrew = (name) => /[֐-׿]/.test(name);

async function fetchOsm() {
  if (process.argv.includes('--offline')) {
    console.log('Reusing the cached Overpass answer.');
    return JSON.parse(readFileSync(OSM_CACHE, 'utf8'));
  }

  for (const endpoint of OVERPASS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Overpass refuses anonymous callers with no agent, and asks that a one-off
          // import say what it is.
          'User-Agent': 'nadlan-neighbourhood-import/1.0 (one-off data import)',
        },
        body: new URLSearchParams({ data: QUERY }),
      });

      if (!response.ok) {
        console.warn(`  ${endpoint} → ${response.status}, trying the next one`);
        continue;
      }

      const body = await response.json();
      // Cached so a re-run, or a change to the merge below, costs Overpass nothing.
      writeFileSync(OSM_CACHE, JSON.stringify(body), 'utf8');
      return body;
    } catch (error) {
      console.warn(`  ${endpoint} → ${error.message}, trying the next one`);
    }
  }

  throw new Error('Every Overpass endpoint refused. Try again later, or --offline.');
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  if (!env.DATABASE_URL) {
    console.error('\nDATABASE_URL is not set.\n');
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

  const boundaries = await prisma.cityBoundary.findMany({
    where: { kind: 'city' },
    select: { name: true, geometry: true, minLat: true, maxLat: true, minLng: true, maxLng: true },
  });
  console.log(`${boundaries.length} municipal boundaries.`);

  const osm = await fetchOsm();
  const points = osm.elements
    .map((element) => ({
      name: element.tags?.name?.trim(),
      lat: element.lat ?? element.center?.lat,
      lng: element.lon ?? element.center?.lon,
    }))
    .filter((p) => p.name && isHebrew(p.name) && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  console.log(`${points.length} named places from OpenStreetMap.`);

  // Every city the publish form can offer. A list keyed under anything else is a list
  // nobody can reach, so those are dropped at the end rather than shipped.
  const offered = new Set(
    readFileSync(path.resolve(root, '../client/src/data/cities.ts'), 'utf8')
      .split('\n')
      .map((line) => /^\s*'(.+)',$/.exec(line)?.[1])
      .filter(Boolean)
      .map((name) => cityKey(name.replace(/\\'/g, "'"))),
  );

  const byCity = new Map();
  const add = (rawKey, name) => {
    const key = SAME_PLACE[rawKey] ?? rawKey;
    // A town is not a neighbourhood of itself.
    if (!key || !name || name.length < 2 || cityKey(name) === key) return false;
    const names = byCity.get(key) ?? [];
    if (names.includes(name)) return false;
    names.push(name);
    byCity.set(key, names);
    return true;
  };

  // The CBS first, so its spelling is the one that survives a near-duplicate.
  const cbs = JSON.parse(readFileSync(CBS_JSON, 'utf8'));
  for (const [key, names] of Object.entries(cbs)) for (const name of names) add(key, name);
  const fromCbs = [...byCity.values()].reduce((n, names) => n + names.length, 0);

  let placed = 0;
  let added = 0;
  for (const point of points) {
    // The bounding box first: a cheap rejection for the ~279 boundaries this point is
    // nowhere near, so the expensive ray cast runs about once per point.
    const city = boundaries.find(
      (b) =>
        point.lat >= b.minLat &&
        point.lat <= b.maxLat &&
        point.lng >= b.minLng &&
        point.lng <= b.maxLng &&
        pointInGeometry(point.lng, point.lat, b.geometry),
    );
    if (!city) continue;

    placed += 1;
    // A locality that *is* its own place — Kochav Yair is a town, not a neighbourhood of
    // one — would otherwise list itself as its own neighbourhood.
    if (cityKey(point.name) === cityKey(city.name)) continue;
    if (add(cityKey(city.name), point.name)) added += 1;
  }

  console.log(`${placed} of them fell inside a city; ${added} were new.`);

  // Regional councils, mostly: their "neighbourhoods" are villages, which are localities
  // in their own right and already on the city list.
  const dropped = [...byCity.keys()].filter((key) => !offered.has(key));
  for (const key of dropped) byCity.delete(key);
  console.log(`${dropped.length} keys the picker cannot reach, dropped.`);

  const total = [...byCity.values()].reduce((n, names) => n + names.length, 0);
  if (total < fromCbs) throw new Error('Merging lost neighbourhoods — refusing to write.');

  const entries = [...byCity.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'he'))
    .map(([key, names]) => `  ${JSON.stringify(key)}: ${JSON.stringify(names)},`)
    .join('\n');

  writeFileSync(
    TARGET,
    `/**
 * Neighbourhoods by city.
 *
 * Generated by \`server/scripts/merge-neighborhoods.mjs\` — do not edit by hand. Two
 * sources: the Central Bureau of Statistics table of 2008 statistical areas, which is
 * authoritative but only covers the localities big enough to be divided into them, and
 * OpenStreetMap, whose places are put inside a municipal boundary to find out which
 * city they belong to. The CBS name wins a tie.
 *
 * Keyed by the same lossy key the server's \`cityKey\` builds, because the city a form
 * sends comes from the CBS locality file, which hyphenates some names these sources
 * write with a space. Look a city up with \`cityKey(city)\`, never with the name itself.
 *
 * ${total} neighbourhoods across ${byCity.size} cities, ${fromCbs} of them from the CBS.
 * Within a city the official names come first, and places nobody lives in — industrial
 * zones, car parks, hospitals — come last.
 */
export const NEIGHBORHOODS: Readonly<Record<string, readonly string[]>> = {
${entries}
};
`,
    'utf8',
  );

  console.log(`Wrote ${total} neighbourhoods across ${byCity.size} cities.`);
  await prisma.$disconnect();
}

await main();
