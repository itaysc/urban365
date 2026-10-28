import { duplicateWhere, hasEnoughSignal, normalizeText } from './duplicate.js';

describe('duplicate listing detection', () => {
  describe('hasEnoughSignal', () => {
    it('needs a city', () => {
      expect(hasEnoughSignal({ street: 'דיזנגוף', rooms: 4 })).toBe(false);
    });

    it('refuses a city on its own, which would flag every flat in town', () => {
      expect(hasEnoughSignal({ city: 'תל אביב' })).toBe(false);
    });

    it('refuses a city and street with nothing to tell units apart', () => {
      expect(hasEnoughSignal({ city: 'תל אביב', street: 'דיזנגוף' })).toBe(false);
    });

    it('accepts a street plus something that separates units', () => {
      expect(hasEnoughSignal({ city: 'תל אביב', street: 'דיזנגוף', rooms: 4 })).toBe(true);
      expect(hasEnoughSignal({ city: 'תל אביב', street: 'דיזנגוף', houseNumber: 12 })).toBe(true);
    });

    it('accepts a size with no street, which most of the scraped data looks like', () => {
      expect(hasEnoughSignal({ city: 'רחובות', squareMeter: 120 })).toBe(true);
    });

    it('treats blank strings as absent', () => {
      expect(hasEnoughSignal({ city: '   ', street: 'דיזנגוף', rooms: 3 })).toBe(false);
    });
  });

  describe('normalizeText', () => {
    it('collapses the differences between two typings of one street', () => {
      expect(normalizeText('  דיזנגוף   ')).toBe('דיזנגוף');
      expect(normalizeText('דיזנגוף  סנטר')).toBe('דיזנגוף סנטר');
      expect(normalizeText('דיזנגוף,')).toBe('דיזנגוף');
    });

    it('returns null for nothing', () => {
      expect(normalizeText('')).toBeNull();
      expect(normalizeText('   ')).toBeNull();
      expect(normalizeText(null)).toBeNull();
    });
  });

  describe('duplicateWhere', () => {
    const agencyId = 'agency-1';

    it('scopes to the agency and ignores archived listings', () => {
      const where = duplicateWhere({ city: 'חיפה', rooms: 3 }, agencyId);
      expect(where.agencyId).toBe(agencyId);
      // Re-listing something that was archived is normal, not a duplicate.
      expect(where.status).toEqual({ not: 'archived' });
    });

    it('excludes the row being edited, so a listing cannot duplicate itself', () => {
      const where = duplicateWhere({ city: 'חיפה', rooms: 3 }, agencyId, 'listing-1');
      expect(where.id).toEqual({ not: 'listing-1' });
    });

    it('constrains only the fields the candidate actually has', () => {
      const where = duplicateWhere({ city: 'חיפה', rooms: 3 }, agencyId);
      expect(where.city).toEqual({ equals: 'חיפה', mode: 'insensitive' });
      expect(where.rooms).toBe(3);
      // Absent on the candidate, so left unconstrained rather than matched against null.
      expect(where.street).toBeUndefined();
      expect(where.houseNumber).toBeUndefined();
      expect(where.floor).toBeUndefined();
    });

    it('allows a few square metres either way, since people round differently', () => {
      const where = duplicateWhere({ city: 'חיפה', squareMeter: 100 }, agencyId);
      expect(where.squareMeter).toEqual({ gte: 97, lte: 103 });
    });

    it('does not match across sections: the same flat to sell and to rent is two listings', () => {
      const where = duplicateWhere({ city: 'חיפה', rooms: 3, section: 'rent' }, agencyId);
      expect(where.section).toBe('rent');
    });

    it('matches a floor of 0, which is a ground floor and not "missing"', () => {
      const where = duplicateWhere({ city: 'חיפה', street: 'הנשיא', floor: 0 }, agencyId);
      expect(where.floor).toBe(0);
    });
  });
});
