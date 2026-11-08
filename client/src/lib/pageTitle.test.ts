import { describe, expect, it } from 'vitest';
import { documentTitle, titleForPath } from './pageTitle';

describe('titleForPath', () => {
  it('names a page from its path', () => {
    expect(titleForPath('/alerts')).toBe('חיפושים שמורים');
    expect(titleForPath('/app/calendar')).toBe('יומן');
  });

  it('leaves the results page to name itself', () => {
    // Its title is the search, which lives in the query string — not something a path
    // can work out.
    expect(titleForPath('/search')).toBeNull();
  });

  it('names the home page long enough for a search result, keyword first', () => {
    const title = documentTitle(titleForPath('/'));

    expect(title).toBe('נדל״ן למכירה ולהשכרה בישראל — דירות לפי עיר · Urban365');
    expect(title.length).toBeGreaterThanOrEqual(50);
    expect(title.length).toBeLessThanOrEqual(60);
  });

  it('prefers an exact path over a prefix', () => {
    expect(titleForPath('/app/listings/new')).toBe('נכס חדש');
    expect(titleForPath('/app/listings/abc123')).toBe('עריכת נכס');
  });

  it('ignores a trailing slash, which a hand-typed url brings', () => {
    expect(titleForPath('/alerts/')).toBe('חיפושים שמורים');
  });

  it('has no name for a path it does not know', () => {
    expect(titleForPath('/nope')).toBeNull();
  });
});

describe('documentTitle', () => {
  it('puts the page first and the brand after', () => {
    expect(documentTitle('יומן')).toBe('יומן · Urban365');
  });

  it('is the brand alone when the page has no name', () => {
    expect(documentTitle(null)).toBe('Urban365');
  });
});
