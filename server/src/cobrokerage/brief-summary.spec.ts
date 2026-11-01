import { describe, expect, it } from 'vitest';
import { briefSummary, type SummarisableBrief } from './brief-summary.js';

const EMPTY: SummarisableBrief = {
  lookingSection: null,
  lookingCities: [],
  lookingTypes: [],
  minRooms: null,
  maxRooms: null,
  minSquareMeter: null,
};

const brief = (over: Partial<SummarisableBrief>): SummarisableBrief => ({ ...EMPTY, ...over });

describe('briefSummary', () => {
  it('says what they are looking for', () => {
    const text = briefSummary(
      brief({
        lookingTypes: ['דירה'],
        minRooms: 3.5,
        maxRooms: 4.5,
        lookingCities: ['חולון'],
        lookingSection: 'forsale',
      }),
    );

    expect(text).toContain('דירה');
    expect(text).toContain('3.5–4.5 חדרים');
    expect(text).toContain('בחולון');
  });

  it('never mentions money, however the brief was written', () => {
    // The price is the one thing that must not cross: a match already proves the buyer
    // can afford the asking price, and the room above it is theirs to keep.
    const text = briefSummary(
      brief({ minRooms: 4, lookingCities: ['בת ים'], minSquareMeter: 90 }),
    );

    expect(text).not.toMatch(/\d{6,}/);
    expect(text).not.toContain('₪');
  });

  it('reads properly when only a floor is given', () => {
    expect(briefSummary(brief({ minRooms: 4 }))).toContain('4 חדרים ומעלה');
  });

  it('reads properly when only a ceiling is given', () => {
    expect(briefSummary(brief({ maxRooms: 3 }))).toContain('עד 3 חדרים');
  });

  it('does not repeat itself when the range is a single number', () => {
    expect(briefSummary(brief({ minRooms: 4, maxRooms: 4 }))).toContain('4 חדרים ומעלה');
  });

  it('says so rather than arriving blank', () => {
    expect(briefSummary(EMPTY)).toBe('לא פורטו דרישות');
  });
});
