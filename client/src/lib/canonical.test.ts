import { describe, expect, it } from 'vitest';
import { canonicalHref, publicOrigin } from './canonical';

const ORIGIN = 'https://urban365.co.il';

describe('publicOrigin', () => {
  it('uses the configured site', () => {
    expect(publicOrigin('https://urban365.co.il/', 'http://localhost:5173')).toBe(
      'https://urban365.co.il',
    );
  });

  it('uses the address bar when the build did not name a site', () => {
    expect(publicOrigin('', 'http://localhost:5173')).toBe('http://localhost:5173');
    expect(publicOrigin(undefined, 'http://localhost:5173')).toBe('http://localhost:5173');
  });
});

describe('canonicalHref', () => {
  it('is the path on the public site, without a trailing slash', () => {
    expect(canonicalHref('/mortgage/', '', ORIGIN)).toBe('https://urban365.co.il/mortgage');
    expect(canonicalHref('/', '', ORIGIN)).toBe('https://urban365.co.il/');
  });

  it('drops a query string that only prefills or tracks', () => {
    expect(canonicalHref('/mortgage', '?price=2000000&utm_source=google', ORIGIN)).toBe(
      'https://urban365.co.il/mortgage',
    );
  });

  it('keeps the search that defines the results, in a stable order', () => {
    const href = canonicalHref('/search', '?utm_source=x&section=forsale&city=חולון', ORIGIN);

    expect(href).toBe(
      `https://urban365.co.il/search?city=${encodeURIComponent('חולון')}&section=forsale`,
    );
  });

  it('ignores the listing opened on top of the results, and page one', () => {
    expect(canonicalHref('/search', '?city=חולון&listing=abc&page=1', ORIGIN)).toBe(
      `https://urban365.co.il/search?city=${encodeURIComponent('חולון')}`,
    );
  });
});
