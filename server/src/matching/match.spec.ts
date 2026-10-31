import { describe, expect, it } from 'vitest';
import { matchBrief, shortlistMatches, type Brief, type Candidate } from './match.js';

const EMPTY_BRIEF: Brief = {
  lookingSection: null,
  lookingCities: [],
  lookingTypes: [],
  minRooms: null,
  maxRooms: null,
  minPrice: null,
  maxPrice: null,
  minSquareMeter: null,
};

const FLAT: Candidate = {
  section: 'forsale',
  city: 'חולון',
  propertyType: 'דירה',
  rooms: 4,
  price: 2_100_000,
  squareMeter: 95,
};

const brief = (over: Partial<Brief>): Brief => ({ ...EMPTY_BRIEF, ...over });

describe('matchBrief', () => {
  it('matches when everything stated fits, and says what fitted', () => {
    const match = matchBrief(
      brief({ lookingSection: 'forsale', lookingCities: ['חולון'], minRooms: 3.5, maxRooms: 4.5 }),
      FLAT,
    );

    expect(match).not.toBeNull();
    expect(match!.reason).toContain('חולון');
    expect(match!.reason).toContain('4 חדרים');
  });

  it('scores a specific brief above a vague one on the same property', () => {
    const vague = matchBrief(brief({ lookingCities: ['חולון'] }), FLAT);
    const precise = matchBrief(
      brief({
        lookingSection: 'forsale',
        lookingCities: ['חולון'],
        lookingTypes: ['דירה'],
        minRooms: 4,
        maxPrice: 2_200_000,
        minSquareMeter: 90,
      }),
      FLAT,
    );

    expect(vague!.score).toBeLessThan(precise!.score);
    expect(precise!.score).toBe(100);
  });

  it('is null when a stated price ceiling is exceeded', () => {
    expect(matchBrief(brief({ maxPrice: 2_000_000 }), FLAT)).toBeNull();
  });

  it('is null when the deal type is not the one they asked for', () => {
    expect(matchBrief(brief({ lookingSection: 'rent' }), FLAT)).toBeNull();
  });

  it('treats differently written city names as the same place', () => {
    const telAviv = { ...FLAT, city: 'תל־אביב–יפו' };
    expect(matchBrief(brief({ lookingCities: ['תל אביב יפו'] }), telAviv)).not.toBeNull();
  });

  it('does not rule a listing out for a field nobody filled in', () => {
    // A scraped row with no square metreage is not evidence that it is too small.
    const unknownSize = { ...FLAT, squareMeter: null };
    expect(matchBrief(brief({ minSquareMeter: 90 }), unknownSize)).not.toBeNull();
  });

  it('leaves an unmeasured field out of the reason rather than guessing at it', () => {
    const unknownSize = { ...FLAT, squareMeter: null };
    const match = matchBrief(brief({ minSquareMeter: 90 }), unknownSize);
    expect(match!.reason).not.toContain('מ״ר');
  });

  it('is null for an empty brief, which is a blank form rather than a match', () => {
    expect(matchBrief(EMPTY_BRIEF, FLAT)).toBeNull();
  });
});

const found = (customerId: string, listingId: string, score = 60) => ({
  customerId,
  listingId,
  score,
});

const nothingSeen = () => false;

describe('shortlistMatches', () => {
  const limits = { perCustomer: 3, total: 50 };

  it('stops one customer taking more than their share', () => {
    const matches = ['a', 'b', 'c', 'd', 'e'].map((listing) => found('vague', listing));

    expect(shortlistMatches(matches, nothingSeen, limits)).toHaveLength(3);
  });

  it('leaves room for everybody else while doing it', () => {
    const matches = [
      ...['a', 'b', 'c', 'd'].map((listing) => found('vague', listing)),
      found('precise', 'e'),
    ];

    const names = shortlistMatches(matches, nothingSeen, limits).map((m) => m.customerId);
    expect(names.filter((id) => id === 'precise')).toHaveLength(1);
  });

  it('keeps the strongest when it has to choose', () => {
    const matches = [found('one', 'weak', 60), found('one', 'strong', 100)];

    const kept = shortlistMatches(matches, nothingSeen, { perCustomer: 1, total: 50 });
    expect(kept[0].listingId).toBe('strong');
  });

  it('offers the next ones once the first have been raised', () => {
    const matches = ['a', 'b', 'c', 'd', 'e'].map((listing) => found('one', listing));
    const alreadyRaised = new Set(['a', 'b', 'c']);

    const kept = shortlistMatches(matches, (m) => alreadyRaised.has(m.listingId), limits);
    expect(kept.map((m) => m.listingId)).toEqual(['d', 'e']);
  });

  it('obeys the overall cap as well', () => {
    const matches = ['one', 'two', 'three', 'four'].map((customer) => found(customer, 'x'));

    expect(shortlistMatches(matches, nothingSeen, { perCustomer: 3, total: 2 })).toHaveLength(2);
  });
});
