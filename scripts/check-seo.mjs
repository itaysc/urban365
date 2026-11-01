/**
 * Audits what a search engine actually receives from the running API.
 *
 * The sibling of this script in foozool-initiatives checks that a set of constants, a
 * build script, a router and a static sitemap all still agree with each other. There is
 * nothing equivalent to check here: these pages are generated from the database at
 * request time, so there is no second copy of the truth to drift from. What can go
 * wrong instead is the output — a page that slips out of the sitemap, two cities that
 * end up with the same title, a canonical pointing at the wrong origin, a phone number
 * reaching a page built for crawlers. So this fetches the pages and reads them.
 *
 * Usage:  npm run check:seo            (against http://localhost:5555)
 *         npm run check:seo -- --base https://api.example.com
 *
 * No dependencies on purpose, like the other scripts in here.
 */

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

/** Where to fetch from — the API, which in production sits behind the public domain. */
const BASE = (argOf('base', process.env.SEO_BASE ?? 'http://localhost:5555')).replace(/\/+$/, '');
/** How many pages of each kind to open. Every one is a request; this is a check, not a crawl. */
const SAMPLE = Number(argOf('sample', process.env.SEO_SAMPLE ?? 12));

const issues = [];
const error = (message) => issues.push({ level: 'error', message });
const warn = (message) => issues.push({ level: 'warn', message });

/** Pages whose title and description must not collide with another page's. */
const seenTitles = new Map();
const seenDescriptions = new Map();

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: { 'User-Agent': 'Urban365-SEO-check' },
  });

  return { status: res.status, type: res.headers.get('content-type') ?? '', body: await res.text(), headers: res.headers };
}

const pick = (list, n) => {
  if (list.length <= n) return list;
  // Evenly spaced rather than the first n: the first n are all one city.
  const step = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]);
};

const one = (html, re) => re.exec(html)?.[1] ?? null;
const all = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

/**
 * The text a reader sees, from the markup an attribute holds.
 *
 * Lengths are judged on this rather than on the raw attribute: `א&#39;` is one
 * apostrophe to everybody except a character count, and a title failing on its escaping
 * is a false alarm that teaches people to ignore the check.
 */
const decode = (text) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

// ---------------------------------------------------------------- robots.txt

/** The site's own URL, as robots.txt declares it. Everything else is checked against it. */
let siteUrl = null;

async function checkRobots() {
  const { status, type, body } = await get('/robots.txt');

  if (status !== 200) return error(`robots.txt answered ${status}`);
  if (!type.startsWith('text/plain')) error(`robots.txt is ${type}, should be text/plain`);

  const sitemap = one(body, /^Sitemap:\s*(\S+)$/m);
  if (!sitemap) return error('robots.txt names no Sitemap');

  try {
    siteUrl = new URL(sitemap).origin;
  } catch {
    return error(`robots.txt Sitemap is not an absolute URL: ${sitemap}`);
  }

  if (!sitemap.endsWith('/sitemap.xml')) {
    warn(`robots.txt points at ${sitemap}, expected it to end in /sitemap.xml`);
  }

  const disallowed = all(body, /^Disallow:\s*(\S+)$/gm);

  if (disallowed.includes('/')) error('robots.txt disallows the whole site');
  for (const open of ['/nadlan', '/sitemap.xml']) {
    if (disallowed.some((d) => open.startsWith(d))) {
      error(`robots.txt disallows ${open}, which has to be crawlable`);
    }
  }
  // The parts behind a sign-in render as an empty shell to a crawler, and a few hundred
  // of those teach a search engine that the site is mostly empty.
  for (const closed of ['/app', '/admin', '/api/']) {
    if (!disallowed.includes(closed)) warn(`robots.txt does not disallow ${closed}`);
  }
}

// ------------------------------------------------------------------ sitemaps

/** Every page URL the sitemaps offer, as paths on the site. */
async function collectSitemapPaths() {
  const index = await get('/sitemap.xml');
  if (index.status !== 200) {
    error(`sitemap.xml answered ${index.status}`);
    return { cities: [], listings: [] };
  }
  if (!index.type.includes('xml')) error(`sitemap.xml is ${index.type}, should be XML`);
  if (!index.body.includes('<sitemapindex')) {
    error('sitemap.xml is not a sitemap index');
    return { cities: [], listings: [] };
  }

  const files = all(index.body, /<loc>([^<]+)<\/loc>/g);
  if (files.length === 0) error('sitemap.xml lists no files');

  const cities = [];
  const listings = [];
  const client = [];

  for (const file of files) {
    if (siteUrl && !file.startsWith(siteUrl)) {
      error(`sitemap.xml lists ${file}, which is not on ${siteUrl}`);
      continue;
    }

    const path = new URL(file).pathname;
    const child = await get(path);

    if (child.status !== 200) {
      error(`${path} answered ${child.status} but is listed in the index`);
      continue;
    }
    if (!child.body.includes('<urlset')) {
      error(`${path} is listed as a sitemap but is not a urlset`);
      continue;
    }

    for (const loc of all(child.body, /<loc>([^<]+)<\/loc>/g)) {
      if (siteUrl && !loc.startsWith(siteUrl)) {
        error(`${path} lists ${loc}, which is not on ${siteUrl}`);
        continue;
      }
      const target = new URL(loc).pathname;

      if (target.startsWith('/nadlan/property/')) listings.push(target);
      else if (target.startsWith('/nadlan')) cities.push(target);
      // Everything else in the sitemap belongs to the React client — the home page,
      // today. Those are rendered in the browser, so none of the checks below apply to
      // them; all that can be asserted from here is that the URL leads somewhere.
      else client.push(target);
    }
  }

  const everything = [...cities, ...listings, ...client];
  const duplicates = everything.filter((p, i) => everything.indexOf(p) !== i);
  if (duplicates.length > 0) {
    error(`the sitemaps list ${duplicates.length} URL(s) more than once, e.g. ${duplicates[0]}`);
  }

  return { cities, listings, client };
}

// --------------------------------------------------------------------- pages

/** A number that could be rung. A page built for crawlers must not carry one. */
const PHONE = /(?:\+?972|0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}/;

async function checkPage(path, { indexable }) {
  const { status, type, body, headers } = await get(path);

  if (status !== 200) {
    error(`${path} answered ${status}`);
    return;
  }
  if (!type.startsWith('text/html')) error(`${path} is ${type}, should be text/html`);

  // --- the document itself
  if (!/<html[^>]+lang="he"/.test(body)) error(`${path} does not declare lang="he"`);
  if (!/<html[^>]+dir="rtl"/.test(body)) error(`${path} does not declare dir="rtl"`);
  if (!/<meta charset="utf-8">/i.test(body)) error(`${path} declares no charset`);
  if (!/name="viewport"/.test(body)) error(`${path} has no viewport meta`);

  // --- the parts a result page is built from
  const title = one(body, /<title>([^<]*)<\/title>/) && decode(one(body, /<title>([^<]*)<\/title>/));
  if (!title) error(`${path} has no <title>`);
  else {
    if (title.length > 65) warn(`${path} title is ${title.length} chars (aim ≤60): "${title}"`);
    if (title.length < 15) warn(`${path} title is only ${title.length} chars: "${title}"`);

    const other = seenTitles.get(title);
    if (other) error(`${path} and ${other} share the title "${title}"`);
    else seenTitles.set(title, path);
  }

  const raw = one(body, /<meta name="description" content="([^"]*)"/);
  const description = raw && decode(raw);
  if (!description) error(`${path} has no meta description`);
  else {
    if (description.length > 165) warn(`${path} description is ${description.length} chars (aim ≤160)`);
    if (description.length < 50) warn(`${path} description is only ${description.length} chars`);

    const other = seenDescriptions.get(description);
    if (other) error(`${path} and ${other} share a meta description`);
    else seenDescriptions.set(description, path);
  }

  // --- where the page says it lives
  const canonical = one(body, /<link rel="canonical" href="([^"]*)"/);
  if (!canonical) error(`${path} has no canonical`);
  else if (siteUrl && !canonical.startsWith(siteUrl)) {
    error(`${path} canonicalises to ${canonical}, which is not on ${siteUrl}`);
  } else if (new URL(canonical).pathname !== decodeURIComponent(path) &&
             decodeURIComponent(new URL(canonical).pathname) !== decodeURIComponent(path)) {
    error(`${path} canonicalises to ${new URL(canonical).pathname}`);
  }

  const robots = one(body, /<meta name="robots" content="([^"]*)"/) ?? '';
  if (indexable && robots.includes('noindex')) {
    error(`${path} is in the sitemap but asks not to be indexed`);
  }
  if (!indexable && !robots.includes('noindex')) {
    error(`${path} should carry noindex`);
  }

  // --- one page, one subject
  const h1s = all(body, /<h1[^>]*>(.*?)<\/h1>/gs);
  if (h1s.length === 0) error(`${path} has no <h1>`);
  if (h1s.length > 1) error(`${path} has ${h1s.length} <h1> elements`);
  if (h1s[0]?.trim() === '') error(`${path} has an empty <h1>`);

  for (const property of ['og:title', 'og:description', 'og:url']) {
    if (!body.includes(`property="${property}"`)) warn(`${path} has no ${property}`);
  }

  // --- structured data that a machine will repeat
  for (const block of all(body, /<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    try {
      const data = JSON.parse(block);
      if (!data['@context']) error(`${path} has a JSON-LD block with no @context`);
    } catch (e) {
      error(`${path} has JSON-LD that does not parse: ${e.message}`);
    }
  }

  // --- what must not be on a page a crawler can read
  const text = body.replace(/<script type="application\/ld\+json">.*?<\/script>/gs, '');
  if (PHONE.test(text.replace(/<[^>]+>/g, ' '))) {
    error(`${path} prints something that looks like a phone number`);
  }
  if (/<a[^>]+href="(tel:|https:\/\/wa\.me)/.test(body)) {
    error(`${path} links straight to a phone number`);
  }
  /*
   * One inline script is allowed: the session check that personalises the bar. Every
   * word a crawler reads is still in the HTML — what the script does is swap a sign-in
   * link for an account link, which no crawler has. Anything else, and especially an
   * external script, would mean the page had started depending on JavaScript to say
   * what it is.
   */
  const scripts = [...body.matchAll(/<script([^>]*)>/g)].map((m) => m[1]);
  const unexpected = scripts.filter(
    (attrs) => !attrs.includes('application/ld+json') && attrs.trim() !== '',
  );
  if (unexpected.length > 0) {
    error(`${path} loads a script with attributes: ${unexpected.join(', ')}`);
  }
  const inline = scripts.filter((attrs) => attrs.trim() === '').length;
  if (inline > 1) error(`${path} has ${inline} inline scripts; only the session check is expected`);

  // And the policy has to name it by hash rather than allowing inline script at large.
  const csp = headers.get('content-security-policy') ?? '';
  if (inline === 1 && !/script-src 'sha256-/.test(csp)) {
    error(`${path} runs an inline script without naming its hash in the policy`);
  }
  if (/script-src[^;]*unsafe-inline/.test(csp)) {
    error(`${path} allows any inline script`);
  }
}

/** Follow the links off a page and make sure they land somewhere. */
async function checkLinksOn(path) {
  const { body } = await get(path);
  const links = [...new Set(all(body, /href="(\/[^"#]*)"/g))];

  for (const link of links) {
    const { status } = await get(link);
    if (status >= 400) error(`${path} links to ${link}, which answers ${status}`);
  }
}

/** The pages that exist to say no. Each has to say it with the right status. */
async function checkMissing() {
  const cases = [
    ['/nadlan/forsale/עיר-שאין-בה-כלום', 404, 'an unknown city'],
    ['/nadlan/nosuchsection/חולון', 404, 'an unknown section'],
    ['/nadlan/property/nosuchlisting', 404, 'an unknown listing'],
  ];

  for (const [path, expected, what] of cases) {
    const { status, body } = await get(encodeURI(path));

    if (status !== expected) error(`${what} answered ${status}, expected ${expected}`);
    if (!/<meta name="robots" content="[^"]*noindex/.test(body)) {
      error(`${path} does not carry noindex`);
    }
  }
}

/** A listing URL with a stale address has to be moved, not served twice. */
async function checkCanonicalRedirect(listingPaths) {
  const sample = listingPaths[0];
  if (!sample) return;

  const id = decodeURIComponent(sample).split('-').pop();
  const { status, headers } = await get(`/nadlan/property/${id}`);

  if (status !== 301) {
    error(`/nadlan/property/<id> answered ${status}, expected a 301 to the full slug`);
    return;
  }

  const location = headers.get('location') ?? '';
  if (decodeURIComponent(location) !== decodeURIComponent(sample)) {
    error(`a bare id redirects to ${location}, expected ${sample}`);
  }
}

// ----------------------------------------------------------------------- run

/** A sitemap entry the React client serves: reachable, and nothing more we can say. */
async function checkClientPage(path) {
  if (!siteUrl) return;

  try {
    const res = await fetch(`${siteUrl}${path}`, { redirect: 'follow' });
    if (!res.ok) error(`${siteUrl}${path} is in the sitemap and answered ${res.status}`);
  } catch (e) {
    warn(`could not reach ${siteUrl}${path} to check it: ${e.message}`);
  }
}

await checkRobots();
const { cities, listings, client } = await collectSitemapPaths();

if (cities.length === 0) error('no city pages are offered in the sitemap');
if (listings.length === 0) warn('no listing pages are offered in the sitemap');

for (const path of pick(cities, SAMPLE)) await checkPage(path, { indexable: true });
for (const path of pick(listings, SAMPLE)) await checkPage(path, { indexable: true });

for (const path of client) await checkClientPage(path);

await checkMissing();
await checkCanonicalRedirect(listings);
if (cities[0]) await checkLinksOn(cities[0]);

const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warn');

for (const issue of warnings) console.warn(`WARN: ${issue.message}`);
for (const issue of errors) console.error(`ERROR: ${issue.message}`);

console.log(
  `Checked ${seenTitles.size} page(s): ${cities.length} city, ${listings.length} listing.`,
);

if (errors.length === 0 && warnings.length === 0) {
  console.log('SEO check passed.');
} else if (errors.length === 0) {
  console.log(`SEO check passed with ${warnings.length} warning(s).`);
} else {
  console.error(`SEO check failed with ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(1);
}
