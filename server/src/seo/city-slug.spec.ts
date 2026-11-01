import { describe, expect, it } from 'vitest';
import { matches, slugKey, toSlug } from './city-slug.js';

describe('toSlug', () => {
  it('joins the words of a name with hyphens', () => {
    expect(toSlug('תל אביב יפו')).toBe('תל-אביב-יפו');
  });

  it('leaves a one-word city alone', () => {
    expect(toSlug('חולון')).toBe('חולון');
  });
});

describe('matches', () => {
  it('finds the city its own slug was made from', () => {
    expect(matches(toSlug('ראשון לציון'), 'ראשון לציון')).toBe(true);
  });

  it('allows for a source that writes the name differently', () => {
    // OpenStreetMap has תל־אביב–יפו with a maqaf and an en dash; a scraped ad has spaces.
    expect(matches('תל-אביב-יפו', 'תל־אביב–יפו')).toBe(true);
  });

  it('does not match a different city', () => {
    expect(matches('חולון', 'בת ים')).toBe(false);
  });

  it('is false for a city we hold nothing for', () => {
    expect(matches('חולון', null)).toBe(false);
  });
});

describe('slugKey', () => {
  it('collapses two spellings of one place onto one key', () => {
    expect(slugKey('תל-אביב-יפו')).toBe(slugKey('תל אביב יפו'));
  });
});
