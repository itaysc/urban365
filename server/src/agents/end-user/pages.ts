import { blogPath } from '../../seo/blog.js';

/** What `open_page` knows how to build a link for. A new page is one entry. */
export interface PageQuery {
  section?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  rooms?: number;
  price?: number;
  slug?: string;
}

export const PAGE_LINKS: Record<string, (query: PageQuery) => string> = {
  search: (query) => {
    const params = new URLSearchParams();
    if (query.section) params.set('section', query.section);
    if (query.city) params.set('city', query.city);
    if (query.minPrice) params.set('minPrice', String(query.minPrice));
    if (query.maxPrice) params.set('maxPrice', String(query.maxPrice));
    if (query.rooms) {
      params.set('minRooms', String(query.rooms));
      params.set('maxRooms', String(query.rooms));
    }
    const qs = params.toString();
    return qs ? `/search?${qs}` : '/search';
  },
  mortgage: (query) => (query.price ? `/mortgage?price=${query.price}` : '/mortgage'),
  valuation: () => '/valuation',
  blog: (query) => (query.slug ? blogPath(query.slug) : '/blog'),
  sell: () => '/sell/new',
  saved: () => '/saved',
  alerts: () => '/alerts',
  agencies: () => '/agencies',
};

export function pageHref(kind: string, query: PageQuery): string | null {
  const build = PAGE_LINKS[kind];
  return build ? build(query) : null;
}
