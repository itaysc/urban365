import { describe, expect, it } from 'vitest';
import { ISRAELI_CITIES } from '@/data/cities';
import { addressOptions } from './address-options';

describe('addressOptions', () => {
  it('keeps a typed house number on the town that matches', () => {
    const options = addressOptions('סוקולוב 12, חול', ISRAELI_CITIES, [], [], []);
    expect(options).toContain('סוקולוב 12, חולון');
  });

  it('offers a street from the register with the house number kept', () => {
    const options = addressOptions('נג׳ארה 9', ISRAELI_CITIES, [], [{ street: 'נג׳ארה ישראל', city: 'תל אביב' }], []);
    expect(options[0]).toBe('נג׳ארה ישראל 9, תל אביב');
  });
});
