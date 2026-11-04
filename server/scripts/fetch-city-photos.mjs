/**
 * Picks one photograph of each city from Wikipedia, and writes them out with their
 * licences.
 *
 * Why not stock: free libraries have Tel Aviv and Jerusalem and nothing of Dimona or
 * Beit She'an — searching those names returns pictures that merely match the word.
 * Hebrew Wikipedia has an article for every municipality in the country and the
 * articles carry photographs of the place, contributed by people who live there.
 *
 * Why not the article's lead image: for an Israeli city that is almost always the
 * municipal coat of arms. The photographs are further down the article.
 *
 * Everything here is Creative Commons or public domain, and the attribution each one
 * requires is written out beside it — see `city-photos.ts`. Run it to add cities, or
 * to re-pick some; the ones not named keep their photograph:
 *
 *   node scripts/fetch-city-photos.mjs cities.txt
 *
 * One city per line. A file rather than arguments because half the names in the
 * country have a space in them, and a shell splits those into two cities that do not
 * exist.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = 'Urban365-CityPhotos/1.0 (https://github.com/urban365; one photograph per city; contact via repo) node/22';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The key each photograph is filed under, which has to be what the page looks it up by.
 *
 * A copy of `cityKey` in `src/listings/city-name.ts`, which is the source of truth —
 * this is a plain script and cannot import the TypeScript. Keep the two in step.
 *
 * It is not cosmetic. The names were written out raw until now, so every city with a
 * gershayim or a maqaf in it filed its photograph under a key the page would never
 * ask for: בני עי"ש had a picture and showed a coloured tile, and 61 of the 1,196
 * settlement names in the deals table are spelled that way.
 */
const cityKey = (name) =>
  name
    .normalize('NFKC')
    .replace(/[־‐-―-]/g, ' ')
    .replace(/[׳״'"׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Wikimedia asks for a descriptive User-Agent and a gentle pace. Both are honoured.
 *
 * It answers 429 when it thinks you are not being gentle, and the right response to
 * that is to wait rather than to hammer: backing off doubles the wait each time, so a
 * run that trips the limit slows down instead of failing.
 */
async function api(host, params, attempt = 0) {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ ...params, format: 'json' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });

  if (res.status === 429 && attempt < 5) {
    const wait = 2_000 * 2 ** attempt;
    console.log(`   … rate limited, waiting ${wait / 1000}s`);
    await sleep(wait);
    return api(host, params, attempt + 1);
  }

  if (!res.ok) throw new Error(`${host} answered ${res.status}`);
  return res.json();
}

/**
 * Emblems, flags, maps and icons: everything an article carries that is not a photo.
 *
 * `plaque` and `שלט` are here for a subtler reason than the rest. A sign *naming* the
 * town is not a picture of it, and the name in the file makes it score well on every
 * other test: Kiryat Yam's article offered a street plaque in Créteil, France, which
 * passed the is-it-this-city check with flying colours because the city's name is
 * written on it in capital letters.
 */
const NOT_A_PHOTO =
  /(coa|coat[_ ]of[_ ]arms|logo|seal|emblem|flag|map|locator|icon|symbol|wiki|commons|blank|outline|star[_ ]of[_ ]david|crystal|gnome|edit|signature|plaque|שלט)/i;

/**
 * What makes one photograph a better card than another.
 *
 * A card wants the place, not its people or its paperwork: a view over the town, its
 * park, its old quarter, its beach. These are the words that appear in the file names
 * of exactly those pictures, in both languages, and they are a far better signal than
 * the order the article happens to use.
 */
const WORTH_SHOWING = [
  [/(aerial|panorama|skyline|view|מהאוויר|מהאויר|נוף|תצפית)/i, 6],
  [/(old[_ ]city|ruins|archaeolog|tel[_ ]|עתיקות|העתיקה|תל[_ ])/i, 5],
  [/(park|garden|promenade|beach|lake|forest|פארק|גן[_ ]|טיילת|חוף|אגם|יער)/i, 4],
  [/(square|boulevard|street|center|centre|כיכר|שדרות|רחוב|מרכז)/i, 3],
  [/(museum|theatre|theater|synagogue|church|tower|מוזיאון|תיאטרון|מגדל)/i, 3],
  [/(building|apartment|housing|בניין|שכונה|מגורים)/i, 1],
  // A photograph of people is a photograph of people, wherever it was taken.
  [/(people|portrait|festival|parade|protest|אנשים|מצעד|הפגנה)/i, -6],
  /*
   * And a memorial is not a view of a town. `Oklahoma garden 1.jpg` won יהוד מונוסון
   * on the strength of the word "garden" and turned out to be a memorial stone — the
   * name of a place of remembrance rarely says so, but the words below are the ones
   * that do when it does, and they outweigh anything that could lift them.
   */
  [/(grave|tomb|cemetery|memorial|monument|holocaust|fallen|yad[_ ]|קבר|בית[_ ]עלמין|אנדרט|זיכרון|הנצחה|חללי|שואה)/i, -12],
];

const score = (name) =>
  WORTH_SHOWING.reduce((total, [pattern, points]) => total + (pattern.test(name) ? points : 0), 0);

/** Every JPEG an article uses that is not an emblem. */
async function candidates(city) {
  const data = await api('he.wikipedia.org', {
    action: 'query',
    prop: 'images',
    imlimit: '100',
    titles: city,
    // Follow redirects. A listing says `תל אביב יפו` and the article is
    // `תל אביב-יפו`; without this the API answers about the redirect itself, which
    // has no images — so the largest city in the country came back empty, four times
    // over, from a query that looked like it had worked.
    redirects: '1',
  });

  const page = Object.values(data.query.pages)[0];
  if (page.missing !== undefined) return [];

  /*
   * The namespace prefix is localised: Hebrew Wikipedia says `קובץ:`, not `File:`.
   * Stripping the literal "File:" left every name prefixed with `קובץ:`, Commons was
   * then asked for a file by a name no file has, and every city came back with
   * nothing — from code that looked right and an API that answered 200 each time.
   */
  return (page.images ?? [])
    .map((i) => i.title.replace(/^[^:]+:/, ''))
    .filter((n) => /\.jpe?g$/i.test(n) && !NOT_A_PHOTO.test(n));
}

/**
 * The city's name in English, from Wikidata.
 *
 * Needed because Commons files about Israeli towns are categorised in English, and
 * the category is the only reliable statement that a photograph is of this place.
 */
async function englishName(city) {
  const props = await api('he.wikipedia.org', {
    action: 'query',
    prop: 'pageprops',
    ppprop: 'wikibase_item',
    titles: city,
    redirects: '1',
  });
  const id = Object.values(props.query.pages)[0]?.pageprops?.wikibase_item;
  if (!id) return null;

  const entity = await api('www.wikidata.org', {
    action: 'wbgetentities',
    ids: id,
    props: 'labels',
    languages: 'en',
  });
  return entity.entities?.[id]?.labels?.en?.value ?? null;
}

/** Size, licence, author and categories, for a batch of files at once. */
async function describe(names) {
  if (names.length === 0) return [];

  const data = await api('commons.wikimedia.org', {
    action: 'query',
    prop: 'imageinfo|categories',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '960',
    cllimit: 'max',
    titles: names.map((n) => `File:${n}`).join('|'),
  });

  const strip = (html) => (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  return Object.values(data.query?.pages ?? {})
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info) return null;
      const meta = info.extmetadata ?? {};
      const value = (key) => meta[key]?.value;

      return {
        name: page.title.replace(/^File:/, ''),
        categories: (page.categories ?? []).map((c) => c.title),
        // The API appends its own analytics parameters to the thumbnail URL; they
        // are no business of ours and no business of the reader's browser.
        thumb: (info.thumburl ?? '').split('?')[0],
        width: info.width,
        height: info.height,
        page: info.descriptionurl,
        licence: strip(value('LicenseShortName')) || 'CC',
        artist: strip(value('Artist')) || 'Wikimedia Commons',
        restrictions: strip(value('Restrictions')),
      };
    })
    .filter(Boolean);
}

/**
 * Whether this file is actually of this city.
 *
 * `prop=images` returns what the article *renders*, templates and navboxes included —
 * which is how a panorama of the Tel Aviv promenade ended up winning on both Ashdod
 * and Ashkelon, scoring highly on a name that mentions neither. A photograph belongs
 * to the city when the city's name is in its own name or in one of its Commons
 * categories, and a shared template image is in neither.
 */
function isOfThisCity(file, city, english) {
  /*
   * Compared with the separators taken out of both sides. A listing says
   * `תל אביב יפו`, the article is `תל אביב-יפו` and Commons files say `Tel Aviv` —
   * three spellings of one city, and an exact comparison matched none of them, so the
   * country's largest city came back with no photograph at all.
   */
  const flatten = (text) => text.toLowerCase().replace(/[\s\-־–—'"״׳]/gu, '');
  const haystack = flatten([file.name, ...file.categories].join(' '));

  if (haystack.includes(flatten(city))) return true;
  if (english === null) return false;
  if (haystack.includes(flatten(english))) return true;

  /*
   * And the first word of the English name on its own. Wikidata calls the city
   * `Tel Aviv-Yafo` while every photograph of it is categorised under `Tel Aviv`, so
   * the whole label matched nothing and the largest city in the country came back
   * bare. Four characters at least, so `Bet` or `Or` cannot match half the country.
   */
  const first = english.split(/[\s-]+/u)[0];
  return first.length >= 4 && haystack.includes(flatten(first));
}

/** The best photograph of one city, or null if the article has none worth using. */
async function pick(city) {
  const [names, english] = await Promise.all([candidates(city), englishName(city)]);
  const files = await describe(names.slice(0, 40));

  const usable = files
    .filter((f) => isOfThisCity(f, city, english))
    // Landscape and large: a card is wider than it is tall, and a portrait crops badly.
    .filter((f) => f.width >= 800 && f.width > f.height * 1.1)
    // "Restrictions" is Commons' flag for trademark and personality rights.
    .filter((f) => !f.restrictions)
    /*
     * GFDL asks you to reproduce the whole licence text beside the work, which is not
     * a thing a card in a grid can do. Creative Commons and public domain need a line
     * of credit, which it can.
     */
    .filter((f) => !/GFDL|GNU/i.test(f.licence))
    .map((f) => ({ ...f, points: score(f.name) }))
    .sort((a, b) => b.points - a.points || b.width * b.height - a.width * a.height);

  return usable[0] ?? null;
}

const listFile = process.argv[2];
if (!listFile) {
  console.error('Usage: node scripts/fetch-city-photos.mjs <file with one city per line>');
  process.exit(1);
}

const cities = readFileSync(listFile, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/seo/city-photos.ts');

/*
 * Merged into what is already there rather than replacing it: a run for a handful of
 * new cities used to rewrite the file with only those, silently dropping every
 * photograph picked before. A city in this run replaces its old entry; a city this run
 * finds nothing for keeps whatever it had.
 */
const existing = (() => {
  try {
    const source = readFileSync(out, 'utf8');
    const json = source.slice(source.indexOf('= {') + 2, source.lastIndexOf('};') + 1);
    return JSON.parse(json);
  } catch {
    return {};
  }
})();

const chosen = [];
for (const city of cities) {
  try {
    const photo = await pick(city);
    if (photo) {
      chosen.push({ city, ...photo });
      console.log(`${city.padEnd(14)} ${String(photo.points).padStart(2)}pts  ${photo.licence.padEnd(16)} ${photo.name.slice(0, 48)}`);
    } else {
      console.log(`${city.padEnd(14)}  —  no usable photograph`);
    }
  } catch (e) {
    console.log(`${city.padEnd(14)}  !  ${e.message}`);
  }
  // Slow enough that Wikimedia never has to tell us to slow down.
  await sleep(2_000);
}

writeFileSync(
  out,
  `/**
 * One photograph of each city, from Hebrew Wikipedia.
 *
 * Generated by \`scripts/fetch-city-photos.mjs\` — edit that, or the entry here, but do
 * not expect a hand edit to survive the next run. Each photograph is Creative Commons
 * or public domain and carries the attribution its licence requires; \`credit\` is
 * printed under the grid and \`page\` links to the file on Commons.
 *
 * Keyed by \`cityKey\`, so a city spelled differently by a feed still finds its picture.
 */
export interface CityPhoto {
  /** Wikimedia's own thumbnail, 960px wide. */
  url: string;
  /** "Name, CC BY-SA 4.0" — what the licence requires us to say. */
  credit: string;
  /** The file's page on Commons, where the full licence lives. */
  page: string;
}

export const CITY_PHOTOS: Record<string, CityPhoto> = ${JSON.stringify(
    {
      ...existing,
      ...Object.fromEntries(
        chosen.map((p) => [
          cityKey(p.city),
          { url: p.thumb, credit: `${p.artist}, ${p.licence}`, page: p.page },
        ]),
      ),
    },
    null,
    2,
  )};
`,
  'utf8',
);

console.log(
  `\n${chosen.length}/${cities.length} cities have a photograph. Merged into src/seo/city-photos.ts, which now has ${
    Object.keys({ ...existing, ...Object.fromEntries(chosen.map((p) => [cityKey(p.city), 1])) }).length
  }.`,
);
