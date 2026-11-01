import { describe, expect, it } from 'vitest';
import { idFromSlug, listingPath, listingSlug } from './listing-slug.js';

const ID = 'cmvu0ayux0046xzh0ifihzgx6';
const address = {
  street: 'סוקולוב',
  houseNumber: 15,
  neighborhood: 'קרית שרת',
  city: 'חולון',
};

describe('listingSlug', () => {
  it('puts the address in front of the id', () => {
    expect(listingSlug(ID, address)).toBe(`סוקולוב-15-חולון-${ID}`);
  });

  it('leaves out the number when there is no street to attach it to', () => {
    expect(listingSlug(ID, { ...address, street: null })).toBe(`חולון-${ID}`);
  });

  it('falls back to the id alone when there is no address at all', () => {
    expect(listingSlug(ID, { street: null, houseNumber: null, neighborhood: null, city: null })).toBe(
      ID,
    );
  });

  it('drops the characters that would end the path or start a query', () => {
    const slug = listingSlug(ID, { ...address, street: 'א/ב?ג#ד' });

    expect(slug).not.toMatch(/[\\/?#&=%+]/u);
  });
});

describe('idFromSlug', () => {
  it('reads the id off the end', () => {
    expect(idFromSlug(listingSlug(ID, address))).toBe(ID);
  });

  it('accepts a bare id, which is what a link made before the address looks like', () => {
    expect(idFromSlug(ID)).toBe(ID);
  });

  it('ignores an address that has since been corrected', () => {
    // The spelling in somebody's saved link must never be load-bearing.
    expect(idFromSlug(`סוקולב-15-חולון-${ID}`)).toBe(ID);
  });

  it('hands back nonsense unchanged, for the lookup to miss on', () => {
    expect(idFromSlug('not-a-listing')).toBe('not-a-listing');
  });
});

describe('listingPath', () => {
  it('encodes the Hebrew', () => {
    expect(listingPath(ID, address)).toBe(
      `/nadlan/property/${encodeURIComponent(`סוקולוב-15-חולון-${ID}`)}`,
    );
  });
});
