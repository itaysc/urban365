import { createHash } from 'node:crypto';
import { esc, jsonLd } from './html.js';

/** The two lucide marks the bar uses, as the app draws them. */
const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
};

/**
 * The one piece of JavaScript on these pages: who is signed in.
 *
 * It cannot be done on the server. These pages are cached and served to every visitor
 * at once — a name rendered into the HTML would be one person's name shown to the
 * next — so the document stays identical for everybody and the browser personalises
 * three elements of the bar after it loads.
 *
 * Everything that matters for a crawler is already in the HTML; this only swaps a
 * sign-in link for an account link. It fails silently and leaves the signed-out bar,
 * which is the correct answer for a visitor who is in fact signed out and for one
 * whose network ate the request.
 */
const SESSION_SCRIPT = `fetch("/api/v1/auth/me",{credentials:"same-origin"})
.then(function(r){return r.ok?r.json():null})
.then(function(d){
var u=d&&d.user;if(!u)return;
var a=document.getElementById("u365-account");
var i=document.getElementById("u365-signin");
var s=document.getElementById("u365-searches");
if(a){a.textContent=u.firstName||"החשבון שלי";a.hidden=false;}
if(s){s.hidden=false;}
if(i){i.hidden=true;}
}).catch(function(){});`;

/**
 * The policy allows exactly this script and nothing else.
 *
 * A hash rather than `unsafe-inline`: the page carries one script whose text is known
 * at build time, so the browser can be told precisely which one to run. Anything
 * injected into this page — through a city name, a street, a seller's description —
 * still cannot execute.
 */
export const SESSION_SCRIPT_HASH = `sha256-${createHash('sha256').update(SESSION_SCRIPT).digest('base64')}`;

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
  /**
   * The link columns across the bottom, from `renderFooterLinks`.
   *
   * Passed in rather than built here: the layout knows nothing about cities, and the
   * controller already holds the cached directory they come from.
   */
  links?: string;
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
/* display:flex above beats the browser's own rule for [hidden], so the sign-in link
   and the account link were both on screen at once, and the account link was there
   before anyone had signed in. */
.navr a[hidden]{display:none}
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
/* The city grid: a photograph, a wash of dark over its foot, and the name on top. */
/* Two across on a phone. One column of thirty-three cards is seven thousand pixels of
   scrolling, and at this size half a card is still a legible photograph. */
.cities{list-style:none;padding:0;margin:.75rem 0 0;display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));gap:.625rem}
@media (min-width:40rem){
  .cities{grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));gap:.875rem}
}
.cities a{position:relative;display:block;aspect-ratio:8/5;border-radius:.875rem;
  overflow:hidden;background:#e2e8f0;text-decoration:none;
  box-shadow:0 1px 2px rgb(15 23 42 / .06)}
.cities img{width:100%;height:100%;object-fit:cover;display:block;
  transition:transform .35s ease}
.cities a:hover img{transform:scale(1.04)}
.cities .blank{position:absolute;inset:0}
/* Dark enough at the foot for white text, clear at the top so the photo still shows. */
.cities .shade{position:absolute;inset:0;
  background:linear-gradient(to top,rgb(15 23 42 / .82) 0%,rgb(15 23 42 / .35) 42%,rgb(15 23 42 / 0) 72%)}
.cities .label{position:absolute;inset-inline:0;bottom:0;padding:.75rem .875rem;
  display:flex;flex-direction:column;gap:.125rem}
.cities .label{padding:.625rem .75rem}
.cities .city{color:#fff;font-weight:700;font-size:.9375rem;line-height:1.2;
  text-shadow:0 1px 3px rgb(15 23 42 / .5)}
.cities .offered{color:rgb(255 255 255 / .85);font-size:.75rem}
@media (min-width:40rem){
  .cities .label{padding:.75rem .875rem}
  .cities .city{font-size:1.0625rem}
  .cities .offered{font-size:.8125rem}
}
.cities a:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.cities a:hover img{transform:none}}
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
footer.site{border-top:1px solid #e2e8f0;background:#fff;padding:2rem 0 1.5rem;margin-top:2.5rem;
  color:#64748b;font-size:.875rem}
footer.site .small{margin:1.5rem 0 0;padding-top:1rem;border-top:1px solid #f1f5f9;
  font-size:.8125rem}
/* The link columns. Two across on a phone, as many as fit above that. */
.sitelinks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5rem 1rem}
@media (min-width:40rem){
  .sitelinks{grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:1.5rem}
}
.sitelinks h2{margin:0 0 .5rem;font-size:.875rem;font-weight:700;color:#0f172a}
.sitelinks ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.3125rem}
.sitelinks a{color:#64748b;text-decoration:none;font-size:.8125rem;line-height:1.45}
.sitelinks a:hover{color:#1d4ed8;text-decoration:underline}
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
<a class="signin" id="u365-signin" href="${esc(options.appUrl)}/login">התחברות</a>
<!--
  Hidden until the script below finds a session. Rendered into the document rather
  than created in JavaScript so the bar does not jump as it appears.
-->
<a id="u365-searches" hidden href="${esc(options.appUrl)}/alerts">${ICON.bell}<span class="word">חיפושים</span></a>
<a class="signin" id="u365-account" hidden href="${esc(options.appUrl)}/app/profile"></a>
</div>
</div></header>
<main class="wrap">${options.body}</main>
<script>${SESSION_SCRIPT}</script>
<footer class="site"><div class="wrap">
${options.links ?? ''}
<p class="small">הנתונים מתבססים על המודעות המתפרסמות באתר ומשתנים עם השוק. אינם ייעוץ או הערכת שווי.</p>
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
