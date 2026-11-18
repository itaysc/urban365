import type { AgentPageContext } from './assistant';

/**
 * What CRM screen the person is on, for the agency assistant.
 *
 * Ids come from the URL so a card link and the open page agree on the same shape.
 */
export function crmPageContext(pathname: string, search: string): AgentPageContext | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const id = params.get('id') ?? undefined;
  const path = query ? `${pathname}?${query}` : pathname;

  if (pathname === '/app/customers' || pathname.startsWith('/app/customers/')) {
    return { kind: 'customer', id, path };
  }
  if (pathname === '/app/leads' || pathname.startsWith('/app/leads/')) {
    return { kind: 'lead', id, path };
  }
  if (pathname === '/app/deals' || pathname.startsWith('/app/deals/')) {
    return { kind: 'deal', id, path };
  }
  if (pathname === '/app/calendar' || pathname.startsWith('/app/calendar/')) {
    const edit = params.get('edit') ?? undefined;
    return { kind: 'calendar', id: edit, path };
  }

  const listing = /^\/app\/listings\/([^/]+)$/.exec(pathname);
  if (listing && listing[1] !== 'new') {
    return { kind: 'listing', id: listing[1], path: pathname };
  }

  if (pathname === '/app' || pathname.startsWith('/app/')) {
    return { kind: 'page', path };
  }

  return null;
}
