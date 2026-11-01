import { esc, jsonLd } from './html.js';

export interface PageOptions {
  title: string;
  description: string;
  /** Absolute, on the public site, whichever origin actually served the bytes. */
  canonical: string;
  /** False keeps the page out of the index while leaving its links worth following. */
  indexable: boolean;
  /** Schema.org objects, each rendered as its own ld+json block. */
  structuredData?: unknown[];
  /** Where the site proper lives, for the links that leave these pages. */
  appUrl: string;
  body: string;
}

/**
 * The stylesheet, inline.
 *
 * One request, no build step and no cache to bust — the whole page is a few kilobytes
 * and arrives complete. That matters more here than anywhere else in the product: a
 * crawler budgets time per site, and a landing page that needs a second request before
 * it means anything spends that budget on a round trip.
 *
 * No JavaScript at all. Everything on the page is text and links.
 */
const STYLES = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#f8fafc;color:#0f172a;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  font-size:16px;line-height:1.6}
a{color:#1d4ed8}
.wrap{max-width:60rem;margin:0 auto;padding:0 1rem}
header.site{background:#fff;border-bottom:1px solid #e2e8f0}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;
  min-height:3.5rem;flex-wrap:wrap}
.brand{font-weight:700;font-size:1.125rem;color:#1d4ed8;text-decoration:none}
nav.crumbs{font-size:.8125rem;color:#64748b;padding:.75rem 0}
nav.crumbs a{color:#64748b}
nav.crumbs span{margin:0 .375rem;color:#cbd5e1}
main{padding-bottom:3rem}
h1{font-size:1.75rem;line-height:1.3;margin:.5rem 0}
h2{font-size:1.25rem;margin:2rem 0 .75rem}
.lede{font-size:1.0625rem;color:#334155;margin:0 0 1.25rem;max-width:46rem}
.figures{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.75rem;margin:1.25rem 0}
.figure{background:#fff;border:1px solid #e2e8f0;border-radius:.75rem;padding:.875rem 1rem}
.figure dt{font-size:.8125rem;color:#64748b;margin:0}
.figure dd{margin:.25rem 0 0;font-size:1.25rem;font-weight:700}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;
  border-radius:.75rem;overflow:hidden;font-size:.9375rem}
caption{text-align:start;color:#64748b;font-size:.8125rem;padding:0 0 .5rem}
th,td{padding:.625rem .875rem;text-align:start;border-bottom:1px solid #f1f5f9}
th{background:#f8fafc;font-size:.8125rem;color:#475569;font-weight:600}
tbody tr:last-child td{border-bottom:0}
/* A price must not break across two lines; on a phone the ₪ ended up alone. */
td.num,th.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.cards{list-style:none;padding:0;margin:0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:.875rem}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:.75rem;overflow:hidden;
  display:flex;flex-direction:column}
.card img,.card .noimage{width:100%;height:9rem;background:#e2e8f0;display:block}
.card img{object-fit:cover}
.card .body{padding:.75rem .875rem;display:flex;flex-direction:column;gap:.25rem;flex:1}
.card .price{font-weight:700}
.card .where{font-size:.875rem;color:#334155}
.card .facts{font-size:.8125rem;color:#64748b;margin-top:auto}
.headline-price{font-size:1.5rem;font-weight:700;margin:.25rem 0 0}
.headline-price .was{margin-inline-start:.625rem;font-size:1rem;font-weight:400;color:#94a3b8;
  text-decoration:line-through}
.gallery{list-style:none;padding:0;margin:1.25rem 0 0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:.5rem}
.gallery img{width:100%;height:11rem;object-fit:cover;border-radius:.625rem;background:#e2e8f0;
  display:block}
/* The first photograph is the one somebody looks at, so it gets the room. */
.gallery li:first-child{grid-column:1/-1}
.gallery li:first-child img{height:20rem}
.chips{list-style:none;padding:0;margin:.5rem 0 0;display:flex;flex-wrap:wrap;gap:.5rem}
/* The same shape as the link chips, for facts that are not links anywhere. */
.chips.plain span{display:inline-block;background:#fff;border:1px solid #e2e8f0;
  border-radius:9999px;padding:.25rem .75rem;font-size:.875rem;color:#334155}
.chips a{display:inline-block;background:#fff;border:1px solid #cbd5e1;border-radius:9999px;
  padding:.25rem .75rem;font-size:.875rem;text-decoration:none;color:#1e293b}
.chips a:hover{border-color:#1d4ed8;color:#1d4ed8}
.cta{display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;
  border-radius:.625rem;padding:.625rem 1.125rem;margin-top:.5rem}
.note{color:#64748b;font-size:.875rem}
footer.site{border-top:1px solid #e2e8f0;background:#fff;padding:1.5rem 0;margin-top:2rem;
  color:#64748b;font-size:.875rem}
@media (max-width:30rem){h1{font-size:1.375rem}.figure dd{font-size:1.0625rem}}
`;

/**
 * One server-rendered page.
 *
 * These pages exist because the product itself is a static React bundle: a crawler that
 * asks for a city gets an empty `<div id="root">` and has to be trusted to run the app
 * before it sees a word of Hebrew. Google usually does. Bing, and most of what now reads
 * the web on somebody's behalf, does not. So the parts of the site that are worth
 * finding are also rendered here, as text, by the server that already holds the data.
 */
export function page(options: PageOptions): string {
  const blocks = (options.structuredData ?? [])
    .map((data) => `<script type="application/ld+json">${jsonLd(data)}</script>`)
    .join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(options.title)}</title>
<meta name="description" content="${esc(options.description)}">
<link rel="canonical" href="${esc(options.canonical)}">
<meta name="robots" content="${options.indexable ? 'index,follow' : 'noindex,follow'}">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="Urban365">
<meta property="og:title" content="${esc(options.title)}">
<meta property="og:description" content="${esc(options.description)}">
<meta property="og:url" content="${esc(options.canonical)}">
<link rel="icon" type="image/svg+xml" href="${esc(options.appUrl)}/favicon.svg">
<style>${STYLES}</style>
${blocks}
</head>
<body>
<header class="site"><div class="wrap">
<a class="brand" href="${esc(options.appUrl)}/">Urban365</a>
<a href="${esc(options.appUrl)}/">חיפוש נכסים</a>
</div></header>
<main class="wrap">${options.body}</main>
<footer class="site"><div class="wrap">
<a href="/nadlan">כל הערים</a> ·
<a href="${esc(options.appUrl)}/terms">תנאי שימוש</a> ·
<a href="${esc(options.appUrl)}/policy">פרטיות</a>
<p>הנתונים מתבססים על המודעות המתפרסמות באתר ומשתנים עם השוק. אינם ייעוץ או הערכת שווי.</p>
</div></footer>
</body>
</html>`;
}

/** The trail at the top of a page, and the same trail as structured data. */
export function breadcrumbs(
  trail: { name: string; href: string }[],
  base: string,
): { html: string; data: unknown } {
  const html = `<nav class="crumbs" aria-label="מיקום באתר">${trail
    .map((step, i) =>
      i === trail.length - 1
        ? `<span aria-current="page">${esc(step.name)}</span>`
        : `<a href="${esc(step.href)}">${esc(step.name)}</a><span>›</span>`,
    )
    .join('')}</nav>`;

  return {
    html,
    data: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trail.map((step, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: step.name,
        item: new URL(step.href, base).toString(),
      })),
    },
  };
}
