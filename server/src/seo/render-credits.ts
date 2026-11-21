import { CITY_PHOTOS } from './city-photos.js';
import { esc } from './html.js';
import { breadcrumbs, page } from './layout.js';

/**
 * Where the photographs come from and who took them.
 *
 * Creative Commons asks for credit "in any reasonable manner based on the medium,
 * means and context", and its own guidance on attribution says in as many words:
 * *consider publishing a web page with attribution information*. So this is that page
 * rather than a paragraph of thirty names crushed under a grid, which satisfied the
 * licence and served nobody — not the reader, who could not tell which name belonged
 * to which picture, and not the photographers, who were a comma-separated list.
 *
 * Here each photograph is named with its city, its author and a link to the file on
 * Commons, which is better attribution than what it replaced as well as tidier.
 *
 * What would *not* be allowed is leaving it out, or burying it in metadata. The same
 * guidance is explicit that metadata alone is not enough.
 */
export function renderCreditsPage(appUrl: string, links = ''): string {
  const canonical = `${appUrl}/nadlan/credits`;
  const trail = breadcrumbs(
    [
      { name: 'ערים', href: '/nadlan' },
      { name: 'קרדיט לתמונות', href: '/nadlan/credits' },
    ],
    canonical,
  );

  const cities = Object.entries(CITY_PHOTOS).sort(([a], [b]) => a.localeCompare(b, 'he'));

  const rows = cities
    .map(
      ([city, photo]) => `<tr>
<th scope="row">${esc(city)}</th>
<td>${esc(photo.credit)}</td>
<td><a href="${esc(photo.page)}" rel="noopener nofollow" target="_blank">בוויקישיתוף</a></td>
</tr>`,
    )
    .join('');

  const body = `${trail.html}
<h1>קרדיט לתמונות</h1>
<p class="lede">התמונות באתר הזה מגיעות מוויקיפדיה ומוויקישיתוף, ברישיונות Creative Commons או כנחלת הכלל. כל רישיון כזה מבקש שניתן קרדיט לצלם — והדף הזה הוא הקרדיט. תודה לכל מי שצילם.</p>
<p class="note">סרטון השער בעמוד הבית צולם עבור האתר. התמונות של הנכסים עצמם אינן ברשימה: הן מגיעות עם המודעות, מהסוכנות או מבעל הנכס שפרסם אותן.</p>

<div class="scroller">
<table>
<thead><tr>
<th scope="col">היכן</th>
<th scope="col">צלם ורישיון</th>
<th scope="col">הקובץ</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</div>`;

  return page({
    // Nothing to index: it is a page of other people's names and outbound links. The
    // links are still worth following, which is what `noindex,follow` says.
    title: 'קרדיט לתמונות | Urban365',
    description: 'מאיפה הגיעו התמונות באתר ומי צילם אותן.',
    canonical,
    indexable: false,
    onCityPages: true,
    links,
    appUrl,
    body,
  });
}
