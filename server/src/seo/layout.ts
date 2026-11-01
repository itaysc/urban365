import { esc, jsonLd } from './html.js';

/** The two lucide marks the bar uses, as the app draws them. */
const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
};

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
  /** Marks "מחירים לפי עיר" as the section being read. */
  onCityPages?: boolean;
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
/*
 * The app's own bar, rebuilt in CSS.
 *
 * Same height, same border, same sticky blur, same wordmark — because a visitor
 * arriving from a search engine is on the same site and should not be able to tell
 * that this page was rendered by something else. What it cannot have is the half that
 * needs a session: these pages are cached and served to everybody at once, so a saved
 * count or somebody's name would be one visitor's data shown to the next. It is the
 * signed-out bar, always, which is also what most of these visitors are.
 */
header.site{position:sticky;top:0;z-index:30;background:rgb(255 255 255 / .95);
  backdrop-filter:blur(8px);border-bottom:1px solid #e2e8f0}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:.75rem;
  height:3.5rem}
.navl,.navr{display:flex;align-items:center;gap:.75rem;min-width:0}
.brand{font-size:1.25rem;font-weight:800;letter-spacing:-.025em;color:#1d4ed8;
  text-decoration:none}
.brand span{color:#3b82f6}
/* The divider and the link beside the wordmark, as the app has them. */
.navl .here{border-inline-start:1px solid #e2e8f0;padding-inline-start:.75rem;
  font-size:.875rem;color:#475569;text-decoration:none}
.navl .here[aria-current]{color:#0f172a;font-weight:600}
.navr a{display:flex;align-items:center;gap:.375rem;font-size:.875rem;color:#475569;
  text-decoration:none}
.navr a:hover{color:#0f172a}
.navr a.publish{border:1px solid #cbd5e1;border-radius:.5rem;padding:.375rem .75rem;
  font-weight:500;color:#334155}
.navr a.publish:hover{border-color:#94a3b8;color:#0f172a}
.navr a.signin{color:#1d4ed8}
.navr a.signin:hover{text-decoration:underline}
.navr svg{width:1.25rem;height:1.25rem;flex:none}
.navr a.publish svg{width:1rem;height:1rem}
/* The words fold away on a phone and the icons stay, exactly as the app does it. */
@media (max-width:40rem){.navl .here,.navr .word{display:none}}
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
/* Five columns do not fit a phone, and a table that overflows the page is worse than
   one that scrolls inside its own box. */
.scroller{overflow-x:auto;border:1px solid #e2e8f0;border-radius:.75rem;background:#fff}
.scroller table{border:0;border-radius:0;min-width:28rem}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;
  border-radius:.75rem;overflow:hidden;font-size:.9375rem}
/* The mean sits beside the median, and reads as the second of the two. */
td.muted{color:#64748b}
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
<div class="navl">
<a class="brand" href="${esc(options.appUrl)}/">Urban<span>365</span></a>
<a class="here" href="/nadlan"${options.onCityPages ? ' aria-current="page"' : ''}>מחירים לפי עיר</a>
</div>
<div class="navr">
<a class="publish" href="${esc(options.appUrl)}/sell/new">${ICON.plus}<span class="word">פרסום נכס</span></a>
<a href="${esc(options.appUrl)}/saved">${ICON.heart}<span class="word">שמורים</span></a>
<!--
  A link rather than the app's dialog: there is no JavaScript on this page to open one,
  and /login is where that dialog would have sent them anyway.
-->
<a class="signin" href="${esc(options.appUrl)}/login">התחברות</a>
</div>
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
