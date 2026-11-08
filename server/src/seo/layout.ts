import { createHash } from 'node:crypto';
import { esc, jsonLd } from './html.js';

/** The two lucide marks the bar uses, as the app draws them. */
const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  menu: '<svg class="open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>',
  close:
    '<svg class="shut" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
};

/**
 * Where the session check calls.
 *
 * Same-origin `/api` is wrong on these pages. They are served on the public site, and
 * `/api` there is the app itself — the request comes back as HTML, the check gives up,
 * and a signed-in visitor is shown התחברות. The cookie lives on the API host, so the
 * call has to go there. The address is this server's, not a visitor's, which is why it
 * may sit in the document while a name may not.
 */
const SAME_ORIGIN_API = '/api/v1';
let sessionApiBase = SAME_ORIGIN_API;
let sessionApiOrigin: string | null = null;

/** The origin the session check is allowed to call, once `setSessionApi` has run. */
export function currentSessionApiOrigin(): string | null {
  return sessionApiOrigin;
}

export function setSessionApi(apiUrl: string): void {
  if (apiUrl === SAME_ORIGIN_API) {
    sessionApiBase = SAME_ORIGIN_API;
    sessionApiOrigin = null;
    return;
  }
  const parsed = new URL(apiUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('API URL cannot be embedded in the session check');
  }
  sessionApiBase = `${parsed.origin}/api/v1`;
  sessionApiOrigin = parsed.origin;
}

/**
 * The one piece of JavaScript on these pages: who is signed in.
 *
 * It cannot be done on the server. These pages are cached and served to every visitor
 * at once — a name rendered into the HTML would be one person's name shown to the
 * next — so the document stays identical for everybody and the browser personalises
 * three elements of the bar after it loads.
 *
 * The address it calls is read from a meta tag, so this text does not change between
 * deploys and the hash that allows it stays one value. It fails silently and leaves
 * the signed-out bar, which is the correct answer for a visitor who is in fact signed
 * out and for one whose network ate the request.
 */
const SESSION_SCRIPT = `var m=document.querySelector('meta[name="u365-api"]');
var b=m&&m.content?m.content:"/api/v1";
fetch(b+"/auth/me",{credentials:"include"})
.then(function(r){return r.ok?r.json():null})
.then(function(d){
var u=d&&d.user;if(!u)return;
var a=document.getElementById("u365-account");
var i=document.getElementById("u365-signin");
var s=document.getElementById("u365-searches");
function letter(name){var t=(name||"").trim();return t?Array.from(t)[0]:"";}
function mark(){return (letter(u.firstName)+letter(u.lastName))||"?";}
if(a){
var name=((u.firstName||"")+" "+(u.lastName||"")).trim()||"החשבון שלי";
a.textContent="";
a.setAttribute("aria-label",name);
a.title=name;
if(u.avatarUrl){
var img=document.createElement("img");
img.alt="";
img.referrerPolicy="no-referrer";
var src=String(u.avatarUrl);
if(src.charAt(0)==="/"){src=b.replace(/\\/api\\/v1$/,"")+src;}
img.src=src;
img.onerror=function(){a.textContent=mark();};
a.appendChild(img);
}else{a.textContent=mark();}
if(u.accountType!=="agency"&&u.platformRole!=="admin"){a.href=a.href.replace(/\\/app\\/profile$/,"/account");}
a.hidden=false;
}
var leave=function(){fetch(b+"/auth/logout",{method:"POST",credentials:"include"}).finally(function(){location.href="/";});};
var outs=document.querySelectorAll("[data-leave]");
for(var n=0;n<outs.length;n++){outs[n].hidden=false;outs[n].addEventListener("click",leave);}
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

/**
 * The policy for one of these pages.
 *
 * `connect-src` names the API as well as this origin: the session check calls the API
 * host, and a policy of `'self'` alone would block it on the public site, where this
 * origin is the app and the API is a subdomain of it.
 */
export function seoCsp(apiOrigin: string, extraScriptHash?: string): string {
  const scripts = extraScriptHash
    ? `'${SESSION_SCRIPT_HASH}' '${extraScriptHash}'`
    : `'${SESSION_SCRIPT_HASH}'`;

  return [
    "default-src 'none'",
    "img-src 'self' https: data:",
    "style-src 'unsafe-inline'",
    `script-src ${scripts}`,
    `connect-src 'self' ${apiOrigin}`,
    "base-uri 'none'",
    extraScriptHash ? "form-action 'self'" : "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

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
  /**
   * The front door. Full width, with its own hero, rather than the column the city
   * pages are read down.
   */
  door?: boolean;
  /**
   * A second inline script, only for the front door's place box. Hashed on its own
   * and named in that page's policy; the city pages do not carry it.
   */
  extraScript?: string;
  /** Marks "מחירים לפי עיר" as the section being read. */
  onCityPages?: boolean;
  /** Marks "בלוג" as the section being read. */
  onBlog?: boolean;
  /**
   * A tag for `<head>`, already safe to embed. The front door preloads its photograph
   * so the browser can fetch it before it reaches the body.
   */
  preload?: string;
  /**
   * The picture a share of this page carries, absolute. Left out, the site's own
   * branded image is used; a city page can pass its photograph instead.
   */
  image?: string;
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
  border-bottom:1px solid #e2e8f0}
@media (min-width:40rem){header.site{backdrop-filter:blur(8px)}}
header.site .wrap,header.site .band{display:flex;align-items:center;justify-content:space-between;gap:.75rem;
  height:3.5rem}
.band{padding-inline:1rem}
footer.site .band{max-width:80rem;margin-inline:auto}
@media (min-width:40rem){.band{padding-inline:2rem}}
.navl,.navr{display:flex;align-items:center;gap:.75rem;min-width:0}
.brand{position:relative;display:inline-block;font-size:1.25rem;font-weight:800;
  letter-spacing:-.025em;color:#1d4ed8;text-decoration:none}
.brand span{color:#3b82f6}
/* The roof from the icon, over the U — the same drawing the app's header carries.
   left, not inset-inline-start: the Latin run is left-to-right even on an RTL page. */
.brand svg{position:absolute;top:-1px;left:-1px;width:18px;height:8px}
/* The divider and the links beside the wordmark, as the app has them. The divider
   belongs to the group rather than to each link, or two links would draw two. */
.navl .here{border-inline-start:1px solid #e2e8f0;padding-inline-start:.5rem;
  display:flex;align-items:center;gap:.125rem;font-size:1rem;color:#475569}
.navl .here a{color:inherit;text-decoration:none;white-space:nowrap;padding:.375rem .625rem;
  border-radius:.5rem;transition:background-color .15s ease,color .15s ease}
.navl .here a[aria-current]{color:#0f172a;font-weight:600}
.navl .here a:hover{background:#f1f5f9;color:#0f172a}
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
/* The account is the picture, or the initials when there is none. Never the name:
   the app's bar is the picture, and this one has to match it. */
.navr a.who{width:2rem;height:2rem;justify-content:center;overflow:hidden;border-radius:9999px;
  background:#e2e8f0;color:#334155;font-size:.75rem;font-weight:600;text-decoration:none}
.navr a.who:hover{color:#334155}
.navr a.who img{width:100%;height:100%;object-fit:cover}
.navr button.leave,.navl .here button.leave{border:0;background:none;font:inherit;cursor:pointer;color:#64748b}
.navr button.leave{font-size:.875rem;padding:0}
.navr button.leave:hover{color:#0f172a}
.navl .here button.leave{display:none}
.navr svg{width:1.25rem;height:1.25rem;flex:none}
.navr a.publish svg{width:1rem;height:1rem}
/*
 * A checkbox, so a phone can open the links without a script. These pages allow one
 * script, the session check, and a menu does not need a second one.
 */
.menubox{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0,0,0,0);white-space:nowrap;border:0}
.burger,.shade,.drawer-x{display:none}
.burger svg{width:1.375rem;height:1.375rem}
.burger .shut{display:none}
/* The words fold away on a phone and the icons stay, exactly as the app does it.
   The links beside the logo move into a drawer that slides in from the right. */
@media (max-width:40rem){
  .burger{display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;
    margin-inline-end:.125rem;border-radius:.5rem;color:#334155;cursor:pointer}
  .burger:hover{background:#f1f5f9}
  .shade{display:block;position:fixed;inset:0;z-index:40;background:rgb(15 23 42 / .4);
    opacity:0;pointer-events:none;transition:opacity .2s ease}
  .navl .here{position:fixed;z-index:50;inset-block:0;inset-inline-start:0;width:18rem;max-width:85vw;
    flex-direction:column;align-items:stretch;gap:.25rem;margin:0;padding:1rem;
    border:0;background:#fff;box-shadow:0 12px 32px rgb(15 23 42 / .18);
    transform:translateX(100%);transition:transform .2s ease;pointer-events:none}
  .menubox:checked ~ .shade{opacity:1;pointer-events:auto}
  .menubox:checked ~ .here{transform:translateX(0);pointer-events:auto}
  .menubox:checked ~ .burger .open{display:none}
  .menubox:checked ~ .burger .shut{display:block}
  .navl .here a,.navl .here button.leave{padding:.75rem .875rem}
  .navr button.leave{display:none}
  .navl .here button.leave{display:block;margin-top:auto;width:100%;text-align:start;font-size:1rem}
  .navl .here button.leave[hidden]{display:none}
  .drawer-x{align-self:flex-start;display:inline-flex;align-items:center;justify-content:center;
    width:2.25rem;height:2.25rem;margin-bottom:.25rem;border-radius:.5rem;color:#334155;cursor:pointer}
  .drawer-x:hover{background:#f1f5f9}
  .drawer-x svg{width:1.375rem;height:1.375rem}
  .navr .word{display:none}
}
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
/* The badges sit over the photograph, stacked: a listing can wear both, and two
   facing each other across a picture read as unrelated. */
.badges{position:absolute;top:.5rem;inset-inline-start:.5rem;z-index:1;
  display:flex;flex-direction:column;align-items:flex-start;gap:.25rem}
.badges .drop{background:#047857;color:#fff;border-radius:.375rem;padding:.125rem .5rem;
  font-size:.75rem;font-weight:600;box-shadow:0 1px 2px rgb(15 23 42 / .2)}
.badges .fresh{background:#fde68a;color:#78350f;border-radius:.375rem;padding:.125rem .5rem;
  font-size:.75rem;font-weight:700;box-shadow:0 1px 2px rgb(15 23 42 / .2)}
.card{position:relative}
/* On the listing page itself there is no photograph behind them, so they sit in the
   flow under the price rather than over anything. */
.headline-price + .badges{position:static;flex-direction:row;margin-top:.5rem}
.card .where{font-size:.875rem;color:#334155}
/*
 * The whole card is the link, without a line of script.
 *
 * The address was the only clickable thing on it, so the photograph, the price and
 * the specs — most of the card's area, and the parts a person actually aims at — did
 * nothing. This stretches the one link over the card instead of wrapping everything
 * in an anchor: one link in the accessibility tree rather than three, and the link
 * text stays the address rather than becoming the whole card read aloud.
 *
 * The "z-index:1" matches the badges. The overlay comes later in the markup, so at the
 * same level it wins, and the corner of the card under a badge is clickable too.
 *
 * The cost is text selection: nothing inside a card can be selected with the pointer
 * any more. Everything on a card is repeated on the page it opens, so that is the
 * cheaper side of the trade.
 */
.card .where::after{content:"";position:absolute;inset:0;z-index:1}
/* The card has to look like the target it now is, and the focus ring has to be around
   the card rather than around the three words that carry the href. */
.card:hover{border-color:#cbd5e1;box-shadow:0 1px 3px rgb(15 23 42 / .12)}
.card:focus-within{outline:2px solid #0f172a;outline-offset:2px}
.card .where:focus-visible{outline:none}
.card .facts{font-size:.8125rem;color:#64748b;margin-top:auto}
.headline-price{font-size:1.5rem;font-weight:700;margin:.25rem 0 0}
.headline-price .was{margin-inline-start:.625rem;font-size:1rem;font-weight:400;color:#64748b;
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
.prose p{margin:0 0 1rem;max-width:40rem}
.prose ul{margin:0 0 1rem;padding-inline-start:1.25rem;max-width:40rem}
.prose li{margin:.35rem 0}
.group{margin-top:1.75rem}
.group h2{font-size:1.125rem;margin:0 0 .25rem}
.posts{list-style:none;padding:0;margin:.75rem 0 0;display:flex;flex-direction:column;gap:.75rem}
.posts a{display:block;background:#fff;border:1px solid #e2e8f0;border-radius:.75rem;
  padding:1rem 1.125rem;text-decoration:none;color:inherit}
.posts a:hover{border-color:#94a3b8}
.posts strong{display:block;color:#0f172a;font-size:1rem}
.posts span{display:block;margin-top:.25rem;color:#64748b;font-size:.875rem;line-height:1.5}
.moreposts{margin-top:1.75rem}
.moreposts h2{font-size:1rem;margin:0 0 .5rem}
.moreposts ul{list-style:none;padding:0;margin:0}
.moreposts li{margin:.35rem 0}
.citylist{list-style:none;padding:0;margin:.5rem 0 0;columns:4 9rem;column-gap:1.5rem}
.citylist li{break-inside:avoid;padding:.1875rem 0}
.citylist a{color:#1d4ed8;text-decoration:none;font-size:.9375rem}
.citylist a:hover{text-decoration:underline}
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
/*
 * The front door, matched to the app's own home: a photograph, the question, then the
 * cities as columns. These rules come last so they win over the column styles above.
 */
main.door{padding:0 0 3rem}
.hero{position:relative;isolation:isolate;z-index:1}
.hero .cover{position:absolute;inset:0;z-index:-1;width:100%;height:100%;object-fit:cover}
.hero .veil{position:absolute;inset:0;z-index:-1;background:rgb(15 23 42 / .55)}
.hero-inner{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;
  gap:1.5rem;max-width:56rem;margin:0 auto;padding:4rem 1rem;text-align:center}
@media (min-width:40rem){.hero-inner{padding:6rem 1rem}}
.door h1{margin:0;color:#fff;font-size:1.875rem;font-weight:800;line-height:1.2;
  text-shadow:0 1px 2px rgb(0 0 0 / .25)}
@media (min-width:40rem){.door h1{font-size:2.25rem}}
.hero .tag{margin:.5rem 0 0;color:rgb(255 255 255 / .9);font-size:1.125rem}
.hero .budget{margin:0;color:rgb(255 255 255 / .9);font-size:.875rem;font-weight:500}
.hero .budget a{color:#fff;font-weight:600;text-underline-offset:.25rem}
.find{position:relative;width:100%;max-width:42rem}
.suggest{position:absolute;z-index:30;inset-inline:0;top:100%;margin-top:.5rem;max-height:60vh;
  overflow:auto;border:1px solid #e2e8f0;border-radius:.75rem;background:#fff;text-align:start;
  color:#334155;box-shadow:0 10px 15px rgb(15 23 42 / .12)}
.suggest[hidden]{display:none}
.suggest .sg-note{margin:0;padding:.75rem 1rem;font-size:.875rem;color:#64748b}
.suggest .sg-near{display:flex;width:100%;align-items:center;gap:.5rem;border:0;border-bottom:1px solid #f1f5f9;
  background:transparent;padding:.75rem 1rem;font:inherit;font-size:.875rem;font-weight:600;color:#2563eb;
  text-align:start;cursor:pointer}
.suggest .sg-near:hover{background:#eff6ff}
.suggest .sg-near:disabled{opacity:.5;cursor:default}
.suggest .sg-err{margin:0;padding:.5rem 1rem;background:#fffbeb;color:#92400e;font-size:.75rem}
.suggest .sg-bar{display:flex;align-items:center;justify-content:space-between;background:#f8fafc;padding:.5rem 1rem}
.suggest h3{margin:0;padding:.5rem 1rem;background:#f8fafc;font-size:.875rem;font-weight:600;color:#0f172a}
.suggest .sg-clear{border:0;background:transparent;padding:0;font:inherit;font-size:.75rem;color:#64748b;cursor:pointer}
.suggest ul{list-style:none;margin:0;padding:0}
.suggest .sg-row{display:flex;width:100%;align-items:baseline;justify-content:space-between;gap:.75rem;
  border:0;background:transparent;padding:.625rem 1rem;font:inherit;font-size:.875rem;color:#475569;
  text-align:start;cursor:pointer}
.suggest .sg-row.on,.suggest .sg-row:hover{background:#f8fafc;color:#1d4ed8}
.suggest .sg-row:disabled{opacity:.4;cursor:default}
.suggest .sg-n{flex:none;font-size:.75rem;color:#64748b;font-variant-numeric:tabular-nums}
.suggest strong{font-weight:600;color:#0f172a}
.suggest .sg-empty{margin:0;padding:1.5rem 1rem;text-align:center;font-size:.875rem;color:#64748b}
.suggest .sg-foot{display:flex;justify-content:space-between;border-top:1px solid #f1f5f9;padding:.75rem 1rem}
.suggest .sg-foot button{border:0;background:transparent;padding:0;font:inherit;font-size:.875rem;cursor:pointer}
.suggest .sg-reset{color:#64748b}
.suggest .sg-reset:disabled{opacity:.4}
.suggest .sg-ok{font-weight:600;color:#2563eb}
.tabs{display:flex;justify-content:center;gap:.5rem;margin-bottom:1rem}
.tab{position:relative;border-radius:9999px;padding:.5rem 1.25rem;font-size:.875rem;font-weight:600;
  color:#fff;background:rgb(255 255 255 / .15);box-shadow:inset 0 0 0 1px rgb(255 255 255 / .4);cursor:pointer}
.tab input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.tab:has(input:checked){background:#fff;color:#0f172a;box-shadow:0 10px 15px rgb(0 0 0 / .15)}
.pill{display:flex;align-items:center;gap:.5rem;border-radius:9999px;background:#fff;padding:.5rem;
  box-shadow:0 25px 50px rgb(0 0 0 / .25)}
/* The names sit in the field, beside the caret. A direct-child button is the search
   control; the remove buttons live inside a badge and must not inherit it. */
.pill-field{display:flex;flex:1;flex-wrap:wrap;align-items:center;gap:.375rem;min-width:0;
  padding-inline:1rem}
.pill-badges{display:flex;flex-wrap:wrap;align-items:center;gap:.375rem;min-width:0;max-width:100%}
.pill-badges[hidden]{display:none}
.pill-badge{display:inline-flex;max-width:100%;align-items:center;gap:.25rem;border-radius:9999px;
  background:#f1f5f9;padding-block:.25rem;padding-inline:.625rem .25rem;font-size:.875rem;
  line-height:1.25;color:#1e293b}
.pill-badge span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill-x{display:inline-flex;width:1.25rem;height:1.25rem;flex:none;align-items:center;
  justify-content:center;border:0;border-radius:9999px;background:transparent;padding:0;
  color:#64748b;font:inherit;line-height:1;cursor:pointer}
.pill-x:hover{background:#e2e8f0;color:#1e293b}
.pill input{flex:1;min-width:4.75rem;border:0;background:transparent;padding:.75rem 0;font:inherit;
  font-size:1rem;color:#0f172a}
.pill input:focus{outline:none}
.pill > button{display:flex;width:3rem;height:3rem;flex:none;align-items:center;justify-content:center;
  border:0;border-radius:9999px;background:#1d4ed8;color:#fff;cursor:pointer}
.pill > button:hover{background:#1e40af}
.pill svg{width:1.25rem;height:1.25rem}
.door-body{max-width:80rem;margin:0 auto;padding:2.5rem 1rem}
@media (min-width:40rem){.door-body{padding:2.5rem 2rem}}
.door-body > h2{margin:0;font-size:1.25rem;font-weight:700;color:#0f172a}
.door .intro{margin:.25rem 0 0;font-size:.875rem;color:#64748b}
.regions{display:grid;gap:1rem;margin-top:1.25rem}
@media (min-width:40rem){.regions{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:64rem){.regions{grid-template-columns:repeat(3,minmax(0,1fr))}}
.region{border:1px solid rgb(226 232 240 / .8);border-radius:1rem;background:#fff;padding:1.25rem}
.region:hover{border-color:#cbd5e1;box-shadow:0 4px 6px rgb(15 23 42 / .06)}
.region h3{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem;margin:0 0 .75rem;
  padding-bottom:.625rem;border-bottom:1px solid #f1f5f9;font-size:.875rem}
.region h3 .count{font-weight:400;font-size:.75rem;color:#64748b}
.region ul{list-style:none;margin:0;padding:0}
.region a{display:flex;align-items:baseline;justify-content:space-between;gap:.75rem;
  margin:0 -.5rem;border-radius:.5rem;padding:.375rem .5rem;color:#475569;font-size:.875rem;text-decoration:none}
.region a:hover{background:#f8fafc;color:#1d4ed8}
.region .n{flex:none;font-size:.75rem;font-variant-numeric:tabular-nums;color:#64748b}
.more{display:flex;flex-wrap:wrap;gap:.25rem 1rem;margin-top:1.25rem;font-size:.875rem}
.more a{color:#1d4ed8}
.credit{margin-top:1.5rem;font-size:.75rem;color:#64748b}
.credit a{color:inherit}
/* Read as part of the link, and kept out of the row so the city name stays the row. */
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0,0,0,0);white-space:nowrap;border:0}
.guide{max-width:42rem;margin:3.5rem auto 0;padding-top:2.5rem;border-top:1px solid #e2e8f0}
.guide h2,.guide h3{color:#0f172a}
.guide h2{margin:0 0 .75rem;font-size:1.25rem;font-weight:700}
.guide h3{margin:1.75rem 0 .5rem;font-size:1.0625rem;font-weight:700}
.guide p{margin:0 0 1rem;font-size:1rem;line-height:1.7;color:#334155}
.guide a{color:#1d4ed8;font-weight:600}
/* The city page's cover: the same photograph the index card uses, full width of the
   column, with the heading on it. These rules come last so they beat the plain h1. */
.citycover{position:relative;display:flex;align-items:flex-end;min-height:13rem;
  margin:.5rem -1rem 1.5rem;overflow:hidden;background:#e2e8f0}
@media (min-width:40rem){.citycover{min-height:16rem;border-radius:1rem}}
.citycover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.citycover figcaption{position:relative;z-index:1;width:100%;margin:0;padding:4.5rem 1.25rem 1rem;
  background:linear-gradient(to top,rgb(15 23 42 / .82),rgb(15 23 42 / .15) 72%,transparent);
  font-style:normal}
.citycover h1{margin:0;color:#fff;font-size:1.75rem;line-height:1.25;
  text-shadow:0 1px 2px rgb(0 0 0 / .4)}
@media (min-width:40rem){.citycover h1{font-size:2.125rem}}
.citycover .by{display:block;margin-top:.25rem;font-size:.5rem;color:rgb(255 255 255 / .85)}
.citycover .by a{color:inherit;text-decoration:underline;text-underline-offset:.15rem}
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
  // The front door runs edge to edge, like the app. The city pages stay a column.
  const frame = options.door ? 'band' : 'wrap';

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(options.title)}</title>
<meta name="description" content="${esc(options.description)}">
<link rel="canonical" href="${esc(options.canonical)}">
<link rel="alternate" hreflang="he" href="${esc(options.canonical)}">
<link rel="alternate" hreflang="x-default" href="${esc(options.canonical)}">
${options.preload ?? ''}
<meta name="robots" content="${options.indexable ? 'index,follow' : 'noindex,follow'}">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="Urban365">
<meta property="og:title" content="${esc(options.title)}">
<meta property="og:description" content="${esc(options.description)}">
<meta property="og:url" content="${esc(options.canonical)}">
<meta property="og:image" content="${esc(options.image ?? `${options.appUrl}/og-image.png`)}">${
    options.image ? '' : '\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">'
  }
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(options.title)}">
<meta name="twitter:description" content="${esc(options.description)}">
<meta name="twitter:image" content="${esc(options.image ?? `${options.appUrl}/og-image.png`)}">
<meta name="theme-color" content="#1d4ed8">
<link rel="icon" type="image/svg+xml" href="${esc(options.appUrl)}/favicon.svg?v=2">
<link rel="icon" href="${esc(options.appUrl)}/favicon.ico?v=2" sizes="48x48">
<link rel="apple-touch-icon" href="${esc(options.appUrl)}/apple-touch-icon.png?v=2">
<meta name="u365-api" content="${esc(sessionApiBase)}">
<style>${STYLES}</style>
${blocks}
</head>
<body>
<header class="site"><div class="band">
<div class="navl">
<input id="u365-menu" class="menubox" type="checkbox">
<label class="burger" for="u365-menu" aria-label="תפריט">${ICON.menu}${ICON.close}</label>
<a class="brand" href="${esc(options.appUrl)}/" aria-label="Urban365, דף הבית"><svg viewBox="0 0 18 8" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6.5 9 1.5l7.5 5"/></svg>Urban<span>365</span></a>
<label class="shade" for="u365-menu" aria-hidden="true"></label>
<nav class="here" aria-label="ניווט ראשי">
<label class="drawer-x" for="u365-menu" aria-label="סגירה">${ICON.close.replace(' class="shut"', '')}</label>
<a href="${esc(options.appUrl)}/agencies">סוכנויות</a>
<a href="/nadlan"${options.onCityPages ? ' aria-current="page"' : ''}>מחירים לפי עיר</a>
<a href="/blog"${options.onBlog ? ' aria-current="page"' : ''}>בלוג</a>
<a href="${esc(options.appUrl)}/mortgage">מחשבון משכנתא</a>
<a href="${esc(options.appUrl)}/valuation">הערכת שווי</a>
<button type="button" class="leave" data-leave hidden>יציאה</button>
</nav>
</div>
<div class="navr">
<a class="publish" href="${esc(options.appUrl)}/sell/new" aria-label="פרסום נכס">${ICON.plus}<span class="word">פרסום נכס</span></a>
<a href="${esc(options.appUrl)}/saved" aria-label="נכסים שמורים">${ICON.heart}<span class="word">שמורים</span></a>
<!--
  A link rather than the app's dialog: there is no JavaScript on this page to open one,
  and /login is where that dialog would have sent them anyway.
-->
<a class="signin" id="u365-signin" href="${esc(options.appUrl)}/login">התחברות</a>
<!--
  Hidden until the script below finds a session. Rendered into the document rather
  than created in JavaScript so the bar does not jump as it appears.
-->
<a id="u365-searches" hidden href="${esc(options.appUrl)}/alerts" aria-label="חיפושים שמורים">${ICON.bell}<span class="word">חיפושים</span></a>
<a class="who" id="u365-account" hidden href="${esc(options.appUrl)}/app/profile" aria-label="החשבון שלי"></a>
<button type="button" class="leave" data-leave hidden>יציאה</button>
</div>
</div></header>
<main class="${options.door ? 'door' : 'wrap'}" id="main">${options.body}</main>
<script>${SESSION_SCRIPT}</script>
${options.extraScript ? `<script>${options.extraScript}</script>` : ''}
<footer class="site"><div class="${frame}">
${options.links ?? ''}
<!--
  Two claims, deliberately separated. The listing figures above are asking prices
  and value nothing. The valuation tool does give a value — an indicative one, read
  off recorded sales — and what it is not is a שמאות מקרקעין, the licensed opinion
  banks and courts accept. Saying "not a valuation" flatly, as this did, stopped
  being true the day that tool shipped.
-->
<p class="small">הנתונים מתבססים על המודעות המתפרסמות באתר ומשתנים עם השוק, ואינם ייעוץ. <a href="${esc(options.appUrl)}/valuation">הערכת השווי</a> היא אינדיקטיבית, מבוססת על עסקאות שנרשמו, ואינה תחליף לשמאות מקרקעין.</p>
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
