import { describe, expect, it } from 'vitest';
import { addressOf } from './address.js';

describe('addressOf', () => {
  it('puts the house number after the street and the city last', () => {
    expect(addressOf({ street: 'סוקולוב', houseNumber: 15, city: 'חולון' })).toBe(
      'סוקולוב 15, חולון',
    );
  });

  it('leaves out a missing house number rather than the street', () => {
    expect(addressOf({ street: 'סוקולוב', houseNumber: null, city: 'חולון' })).toBe(
      'סוקולוב, חולון',
    );
  });

  it('is a city on its own when that is all there is, as on a scraped listing', () => {
    expect(addressOf({ street: null, houseNumber: null, city: 'חולון' })).toBe('חולון');
  });

  it('is null rather than an empty string when there is nothing to say', () => {
    expect(addressOf({ street: null, houseNumber: null, city: null })).toBeNull();
  });

  it('does not emit a stray comma for a street with no city', () => {
    expect(addressOf({ street: 'סוקולוב', houseNumber: 15, city: null })).toBe('סוקולוב 15');
  });
});
