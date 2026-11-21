import { describe, expect, it } from 'vitest';
import {
  positionAgainstAsking,
  positionAgainstSales,
  readQuestions,
} from './price-position.js';

describe('positionAgainstSales', () => {
  const range = { low: 1_900_000, high: 2_100_000, expected: 2_000_000, count: 18, thin: false };

  it('says how far an asking price sits above the sales', () => {
    const position = positionAgainstSales(2_200_000, range);

    expect(position?.stance).toBe('above');
    expect(position?.gapPercent).toBe(10);
    expect(position?.offer).toBe(1_900_000);
    expect(position?.headline).toBe('המחיר המבוקש גבוה ב־10% מעסקאות דומות');
    expect(position?.detail).toContain('פתיחה סבירה');
    expect(position?.detail).toContain('לא שמאות');
  });

  it('calls a price inside the range what it is', () => {
    const position = positionAgainstSales(2_000_000, range);

    expect(position?.stance).toBe('within');
    expect(position?.offer).toBeNull();
    expect(position?.headline).toBe('המחיר בתוך טווח העסקאות הדומות');
  });

  it('says when the ad is already under the sales', () => {
    const position = positionAgainstSales(1_800_000, range);

    expect(position?.stance).toBe('below');
    expect(position?.gapPercent).toBe(-10);
    expect(position?.offer).toBeNull();
  });
});

describe('positionAgainstAsking', () => {
  it('names the ads, and does not offer a number the sales did not produce', () => {
    const position = positionAgainstAsking(2_300_000, 2_000_000, 6);

    expect(position?.basis).toBe('asking');
    expect(position?.offer).toBeNull();
    expect(position?.headline).toContain('מהמודעות ברחוב');
    expect(position?.detail).toContain('אין מספיק עסקאות');
  });

  it('stays quiet when the street has only a couple of ads', () => {
    expect(positionAgainstAsking(2_300_000, 2_000_000, 3)).toBeNull();
  });
});

describe('readQuestions', () => {
  it('keeps a question that does not invent a price', () => {
    const questions = readQuestions(
      JSON.stringify({ questions: ['האם יש חניה צמודה?', 'מה גובה ועד הבית?', '2,200,000 זה סופי?'] }),
    );

    expect(questions).toEqual(['האם יש חניה צמודה?', 'מה גובה ועד הבית?']);
  });

  it('returns nothing when only one question survives', () => {
    expect(readQuestions(JSON.stringify({ questions: ['האם יש חניה?'] }))).toEqual([]);
  });
});
