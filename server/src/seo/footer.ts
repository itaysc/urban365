import { SECTIONS, type Section } from '../yad2/yad2.types.js';
import type { CityEntry } from './city-page.service.js';
import { toSlug } from './city-slug.js';
import { esc } from './html.js';

/**
 * How many cities each column lists.
 *
 * Enough to be a map of where the inventory is, few enough that the footer stays a
 * footer. Every city is one click away through `/nadlan` regardless, so this is about
 * which ones deserve a direct link from every page — and that is the ones somebody is
 * most likely to be looking for.
 */
const PER_COLUMN = 12;

const SECTION_TITLE: Record<Section, string> = {
  forsale: 'דירות למכירה',
  rent: 'דירות להשכרה',
  commercial: 'נדל״ן מסחרי',
};

interface Column {
  title: string;
  links: { href: string; text: string }[];
}

/** The cities with the most of this kind, biggest first. */
function citiesFor(entries: CityEntry[], section: Section): Column | null {
  const links = entries
    .filter((entry) => entry.counts[section] > 0)
    .sort((a, b) => b.counts[section] - a.counts[section])
    .slice(0, PER_COLUMN)
    .map((entry) => ({
      href: `/nadlan/${section}/${encodeURIComponent(toSlug(entry.city))}`,
      text: `${SECTION_TITLE[section]} ב${entry.city}`,
    }));

  // A column of two is not a column. Those cities are still in the index.
  return links.length >= 3 ? { title: SECTION_TITLE[section], links } : null;
}

/**
 * The links across the bottom of every page.
 *
 * This is the part of the site that search engines walk. A page is worth indexing in
 * proportion to what links to it, and until now a city page was reachable only from
 * the index and from the handful of cities in its own district — so the quiet ones
 * were three clicks from anywhere and read as an afterthought. From the footer every
 * one of the busiest is one click from every page on the site, which is the same
 * arrangement every property portal in the country uses and for the same reason.
 *
 * Built from the directory that is already cached, so it costs nothing per page.
 */
export function renderFooterLinks(entries: CityEntry[], appUrl: string): string {
  const columns: Column[] = [];

  for (const section of SECTIONS) {
    const column = citiesFor(entries, section);
    if (column) columns.push(column);
  }

  columns.push({
    title: 'חיפוש',
    links: [
      { href: `${appUrl}/forsale`, text: 'דירות למכירה בכל הארץ' },
      { href: `${appUrl}/rent`, text: 'דירות להשכרה בכל הארץ' },
      { href: `${appUrl}/commercial`, text: 'נדל״ן מסחרי בכל הארץ' },
      { href: '/nadlan', text: 'כל ערי ישראל ומחיריהן' },
      { href: `${appUrl}/mortgage`, text: 'כמה החזר חודשי אפשר לעמוד בו' },
      { href: `${appUrl}/sell/new`, text: 'פרסום דירה על ידי הבעלים' },
    ],
  });

  columns.push({
    title: 'מידע',
    links: [
      { href: '/blog', text: 'מאמרים על מחיר, משכנתא ושוק' },
      { href: `${appUrl}/terms`, text: 'תנאי שימוש' },
      { href: `${appUrl}/policy`, text: 'מדיניות פרטיות' },
      { href: `${appUrl}/accessibility`, text: 'הצהרת נגישות' },
    ],
  });

  return `<nav class="sitelinks" aria-label="מפת האתר">${columns
    .map(
      (column) => `<div>
<h2>${esc(column.title)}</h2>
<ul>${column.links
        .map((link) => `<li><a href="${esc(link.href)}">${esc(link.text)}</a></li>`)
        .join('')}</ul>
</div>`,
    )
    .join('')}</nav>`;
}
