import { describe, expect, it } from 'vitest';
import { addressLine, esc, jsonLd, price, properties } from './html.js';

describe('esc', () => {
  it('neutralises a tag', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });

  it('neutralises the quotes that would break out of an attribute', () => {
    expect(esc('a" onload="x')).toBe('a&quot; onload=&quot;x');
  });

  it('escapes the ampersand first, so an entity is not double-built', () => {
    expect(esc('&lt;')).toBe('&amp;lt;');
  });

  it('leaves Hebrew alone', () => {
    expect(esc('תל אביב יפו')).toBe('תל אביב יפו');
  });

  it('is empty for nothing, rather than the word null', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('jsonLd', () => {
  it('stops a string value closing the script block', () => {
    const out = jsonLd({ name: '</script><img onerror=x>' });

    expect(out).not.toContain('</script>');
    expect(JSON.parse(out)).toEqual({ name: '</script><img onerror=x>' });
  });
});

describe('price', () => {
  it('groups the digits and puts the shekel last', () => {
    expect(price(2_150_000)).toBe('2,150,000 ₪');
  });

  it('is a dash when there is no price, never a zero', () => {
    expect(price(null)).toBe('—');
  });

  it('keeps a real zero', () => {
    expect(price(0)).toBe('0 ₪');
  });
});

describe('properties', () => {
  it('says one property as a word', () => {
    expect(properties(1)).toBe('נכס אחד');
  });

  it('counts the rest', () => {
    expect(properties(13)).toBe('13 נכסים');
  });
});

describe('addressLine', () => {
  it('joins street, number, neighbourhood and city', () => {
    expect(
      addressLine({ street: 'סוקולוב', houseNumber: 15, neighborhood: 'קרית שרת', city: 'חולון' }),
    ).toBe('סוקולוב 15, קרית שרת, חולון');
  });

  it('leaves out what the listing does not carry', () => {
    expect(addressLine({ street: null, houseNumber: null, neighborhood: null, city: 'חולון' })).toBe(
      'חולון',
    );
  });

  it('does not write a street number with no street', () => {
    // A scraped listing can carry a number and no name; "15, חולון" helps nobody.
    expect(addressLine({ street: null, houseNumber: 15, neighborhood: null, city: 'חולון' })).toBe(
      'חולון',
    );
  });
});
