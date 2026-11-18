import { describe, expect, it } from 'vitest';
import { crmPageContext } from './page-context';

describe('crmPageContext', () => {
  it('reads a customer id from the query string', () => {
    expect(crmPageContext('/app/customers', '?id=c1')).toEqual({
      kind: 'customer',
      id: 'c1',
      path: '/app/customers?id=c1',
    });
  });

  it('reads a lead and a deal the same way', () => {
    expect(crmPageContext('/app/leads', 'id=l1')).toEqual({
      kind: 'lead',
      id: 'l1',
      path: '/app/leads?id=l1',
    });
    expect(crmPageContext('/app/deals', '?id=d1')).toEqual({
      kind: 'deal',
      id: 'd1',
      path: '/app/deals?id=d1',
    });
  });

  it('uses the calendar edit id as the open meeting', () => {
    expect(crmPageContext('/app/calendar', '?edit=m1&day=2026-11-18')).toEqual({
      kind: 'calendar',
      id: 'm1',
      path: '/app/calendar?edit=m1&day=2026-11-18',
    });
  });

  it('takes a listing id from the path', () => {
    expect(crmPageContext('/app/listings/abc', '')).toEqual({
      kind: 'listing',
      id: 'abc',
      path: '/app/listings/abc',
    });
    expect(crmPageContext('/app/listings/new', '')).toEqual({
      kind: 'page',
      path: '/app/listings/new',
    });
  });

  it('reads mortgage case and banker screens', () => {
    expect(crmPageContext('/app/mortgage-cases/c1', '')).toEqual({
      kind: 'mortgage_case',
      id: 'c1',
      path: '/app/mortgage-cases/c1',
    });
    expect(crmPageContext('/app/banker-contacts', '?id=b1')).toEqual({
      kind: 'banker',
      id: 'b1',
      path: '/app/banker-contacts?id=b1',
    });
  });

  it('names a generic CRM screen when there is no entity', () => {
    expect(crmPageContext('/app/customers', '')).toEqual({
      kind: 'customer',
      id: undefined,
      path: '/app/customers',
    });
    expect(crmPageContext('/app', '')).toEqual({ kind: 'page', path: '/app' });
  });

  it('ignores public pages', () => {
    expect(crmPageContext('/search', '')).toBeNull();
    expect(crmPageContext('/', '')).toBeNull();
  });
});
