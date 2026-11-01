import { describe, expect, it } from 'vitest';
import { addressIsIntact, unsupportedNumbers, type DraftFacts } from './draft-check.js';

const FACTS: DraftFacts = {
  address: 'אחד העם 9, חולון',
  rooms: 4,
  price: 2_250_000,
  squareMeter: 98,
};

describe('unsupportedNumbers', () => {
  it('passes a draft that states only what it was given', () => {
    const text = 'היי אבי, יש דירה באחד העם 9, חולון — 4 חדרים, 98 מ״ר, 2,250,000 ₪.';
    expect(unsupportedNumbers(text, FACTS)).toEqual([]);
  });

  it('accepts a price written without separators', () => {
    expect(unsupportedNumbers('במחיר 2250000 ₪', FACTS)).toEqual([]);
  });

  it('catches an invented floor', () => {
    // The commonest kind: fluent, plausible, and not in the record.
    expect(unsupportedNumbers('דירה בקומה 3, 4 חדרים', FACTS)).toContain('3');
  });

  it('catches a price that is not the asking price', () => {
    expect(unsupportedNumbers('במחיר 2,100,000 ₪', FACTS)).toContain('2,100,000');
  });

  it('allows the house number from the address', () => {
    expect(unsupportedNumbers('אחד העם 9', FACTS)).toEqual([]);
  });

  it('ignores a trailing full stop after a number', () => {
    expect(unsupportedNumbers('השטח הוא 98.', FACTS)).toEqual([]);
  });

  it('has nothing to object to when nothing was given', () => {
    const empty: DraftFacts = { address: null, rooms: null, price: null, squareMeter: null };
    expect(unsupportedNumbers('שלום, יש לי משהו בשבילך.', empty)).toEqual([]);
  });
});

describe('addressIsIntact', () => {
  it('passes the address written correctly', () => {
    expect(addressIsIntact('דירה באחד העם 9, חולון', FACTS.address)).toBe(true);
  });

  it('catches a street name that is nearly right', () => {
    // `חת העם` reads as fluent Hebrew and is the wrong road.
    expect(addressIsIntact('דירה בחת העם 9, חולון', FACTS.address)).toBe(false);
  });

  it('passes a draft that names only the city', () => {
    expect(addressIsIntact('דירה בחולון, 4 חדרים', FACTS.address)).toBe(true);
  });

  it('has nothing to check when there is no address', () => {
    expect(addressIsIntact('שלום', null)).toBe(true);
  });
});
