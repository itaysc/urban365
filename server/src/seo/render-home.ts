import type { Section } from '../yad2/yad2.types.js';
import type { CityEntry } from './city-page.service.js';
import { HOME_GUIDE } from './home-guide.js';
import { esc, number } from './html.js';
import { page } from './layout.js';
import { cityHref, mainSection, totalIn } from './render-index.js';

/**
 * The same film the app's home uses.
 *
 * The source is eight seconds. Playing that slowly in the browser holds each of its
 * 24 frames, so the picture steps. This file is those eight seconds already stretched
 * to thirty, with the missing frames filled in, and it plays at ordinary speed.
 * The still is the first frame, shown until the file is ready and when the reader
 * has asked for less motion.
 */
const COVER_VIDEO = '/home/urban1-slow.mp4';
const COVER_POSTER = '/home/urban1-poster.jpg';

const COVER_PAUSE = `<svg class="on" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const COVER_PLAY = `<svg class="off" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" hidden><path d="M8 5.5v13l11-6.5z"/></svg>`;

/**
 * Mute the cover, honour reduced motion, and let the corner button stop it or start it.
 *
 * Hashed with the place-search script: `withCoverPlayback` is what the page embeds
 * and what the home policy allows. A byte that is only in one of those two is a
 * script the browser refuses to run.
 */
export const COVER_PLAYBACK_SCRIPT = `(function(){
var v=document.querySelector(".hero video.cover");
var b=document.getElementById("u365-cover");
if(!v||!b)return;
v.muted=true;
var on=b.querySelector(".on");
var off=b.querySelector(".off");
function paint(){
  var playing=!v.paused;
  b.setAttribute("aria-pressed",playing?"true":"false");
  b.setAttribute("aria-label",playing?"עצירת הסרטון":"הפעלת הסרטון");
  if(on)on.hidden=!playing;
  if(off)off.hidden=playing;
}
b.addEventListener("click",function(){
  if(v.paused){var p=v.play();if(p&&p.catch)p.catch(function(){});}
  else v.pause();
});
v.addEventListener("play",paint);
v.addEventListener("pause",paint);
if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){
  v.removeAttribute("autoplay");
  var stop=function(){v.pause();paint();};
  if(v.readyState>=1)stop();else v.addEventListener("loadedmetadata",stop);
  return;
}
paint();
})();`;

/** The place-search script plus the cover. One block, so one hash covers both. */
export function withCoverPlayback(placeScript: string): string {
  return placeScript ? `${placeScript}\n${COVER_PLAYBACK_SCRIPT}` : COVER_PLAYBACK_SCRIPT;
}

const LINK_LEAD: Record<Section, string> = {
  forsale: 'דירות למכירה ב',
  rent: 'דירות להשכרה ב',
  commercial: 'נדל״ן מסחרי ב',
};

/** Per column, as the app's home does it, so a column stays a column. */
const PER_REGION = 10;

const SEARCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;

/**
 * The same order the app lists the districts in. A district it does not name goes last.
 */
const REGIONS = [
  'מרכז והשרון',
  'תל אביב והסביבה',
  'ירושלים והסביבה',
  'שפלה',
  'חיפה והקריות',
  'חדרה והעמקים',
  'צפון והגליל',
  'דרום',
  'יהודה ושומרון',
];

/** The reading under the city columns. The first block titles it; the rest are its parts. */
function renderGuide(): string {
  const blocks = HOME_GUIDE.map((section, index) => {
    const tag = index === 0 ? 'h2' : 'h3';
    const links = (section.links ?? [])
      .map((link) => `<p><a href="${esc(link.href)}">${esc(link.label)}</a></p>`)
      .join('');
    return `<${tag}>${esc(section.heading)}</${tag}>${section.paragraphs
      .map((paragraph) => `<p>${esc(paragraph)}</p>`)
      .join('')}${links}`;
  }).join('');

  return `<article class="guide">${blocks}</article>`;
}

/**
 * The front door, drawn the way the app draws it.
 *
 * A film, the one question (where, and buying or renting), then the cities in
 * columns. The three choices are radio buttons and the box is a real field —
 * submitting it opens the same search the app does, with or without the script.
 */
export function renderHomePage(
  groups: { name: string | null; cities: CityEntry[] }[],
  appUrl: string,
  links = '',
  /** The place box. Omitted, the form still submits; it just does not suggest. */
  script = '',
): string {
  const columns = groups
    .map((group) => ({
      name: group.name ?? 'אזורים נוספים',
      cities: [...group.cities].sort((a, b) => totalIn(b) - totalIn(a)).slice(0, PER_REGION),
    }))
    .filter((group) => group.cities.length > 0)
    .sort((a, b) => {
      const ai = REGIONS.indexOf(a.name);
      const bi = REGIONS.indexOf(b.name);
      if (ai === -1 && bi === -1) return b.cities.length - a.cities.length;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  const sections = columns
    .map(
      (group) => `<section class="region">
<h3><span>${esc(group.name)}</span><span class="count">${esc(String(group.cities.length))} ערים</span></h3>
<ul>${group.cities
        .map((entry) => {
          const count = totalIn(entry);
          const lead = `${LINK_LEAD[mainSection(entry)]}${entry.city}`;
          const name = count > 0 ? `${lead}, ${number(count)} נכסים` : lead;
          return `<li><a href="${esc(cityHref(entry))}"><span class="sr">${esc(name)}</span><span aria-hidden="true">${esc(entry.city)}</span><span class="n" aria-hidden="true">${count > 0 ? esc(number(count)) : ''}</span></a></li>`;
        })
        .join('')}</ul>
</section>`,
    )
    .join('');

  const body = `<section class="hero">
<div class="stage">
<div class="cover-move"><video class="cover" src="${COVER_VIDEO}" poster="${COVER_POSTER}" width="1280" height="720" muted autoplay loop playsinline preload="auto" disablepictureinpicture aria-hidden="true"></video></div>
<div class="veil" aria-hidden="true"></div>
</div>
<button type="button" class="cover-toggle" id="u365-cover" aria-pressed="true" aria-label="עצירת הסרטון">${COVER_PAUSE}${COVER_PLAY}</button>
<div class="hero-inner">
<div>
<h1>דירות למכירה ולהשכרה בישראל</h1>
<p class="tag">דירות למכירה ולהשכרה בישראל, מהסוכנויות ומבעלי הבתים, במקום אחד.</p>
</div>
<form class="find" id="u365-find" action="/search" method="get">
<div class="tabs">
<label class="tab"><input type="radio" name="section" value="forsale" checked> מכירה</label>
<label class="tab"><input type="radio" name="section" value="rent"> השכרה</label>
<label class="tab"><input type="radio" name="section" value="commercial"> מסחרי</label>
</div>
<div class="pill">
<div class="pill-field">
<input id="u365-q" name="city" placeholder="עיר, שכונה או רחוב" aria-label="עיר, שכונה או רחוב" role="combobox" aria-expanded="false" aria-controls="u365-list" aria-autocomplete="list" autocomplete="off">
</div>
<button type="submit" aria-label="חיפוש">${SEARCH}</button>
</div>
<div class="suggest" id="u365-list" hidden></div>
</form>
<p class="budget">לא בטוחים מה התקציב? <a href="/mortgage">מחשבון המשכנתא</a> מחשב איזו דירה אפשר לקנות ומה יהיה ההחזר החודשי.</p>
</div>
</section>
<div class="door-body">
<h2>נדל״ן לפי עיר</h2>
<p class="intro">לכל עיר דף עם מחירים, פילוח לפי חדרים ושכונות, והנכסים שמוצעים בה כרגע.</p>
<div class="regions">${sections}</div>
<p class="more"><a href="/nadlan">כל הערים ומחירי הנדל״ן בהן ←</a> <a href="/agencies">סוכנויות נדל״ן ←</a></p>
${renderGuide()}
<p class="credit">תמונות הערים מוויקיפדיה ומוויקישיתוף. <a href="/nadlan/credits">קרדיט לצלמים</a></p>
</div>`;

  return page({
    title: 'נדל״ן למכירה ולהשכרה בישראל — דירות לפי עיר · Urban365',
    description:
      'דירות למכירה ולהשכרה בישראל לפי עיר. ראו מה נמכר באמת, את הנכסים שמוצעים עכשיו, הערכת שווי ומחשבון משכנתא — מסוכנויות ומבעלי בתים, לפני הפנייה.',
    canonical: `${appUrl}/`,
    indexable: true,
    door: true,
    preload: `<link rel="preload" as="image" href="${COVER_POSTER}" fetchpriority="high" type="image/jpeg">`,
    extraScript: withCoverPlayback(script),
    links,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Urban365',
        url: `${appUrl}/`,
        inLanguage: 'he-IL',
        description: 'דירות ונכסים מסחריים למכירה ולהשכרה בישראל, מהסוכנויות ומבעלי הבתים.',
      },
    ],
    appUrl,
    body,
  });
}
