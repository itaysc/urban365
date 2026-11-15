import { describe, expect, it } from 'vitest';
import { splitPlace } from './address-line';

describe('splitPlace', () => {
  it('reads a comma the same as a space before the town', () => {
    expect(splitPlace('סוקולוב, הרצליה')).toEqual({
      street: 'סוקולוב',
      house: '',
      city: 'הרצליה',
      separated: true,
      loose: false,
    });
    expect(splitPlace('סוקולוב הרצליה')).toEqual({
      street: 'סוקולוב',
      house: '',
      city: 'הרצליה',
      separated: true,
      loose: false,
    });
  });

  it('keeps the town when only the start of its name has been typed', () => {
    expect(splitPlace('סוקולוב הרצל')).toEqual({
      street: 'סוקולוב',
      house: '',
      city: 'הרצל',
      separated: true,
      loose: true,
    });
  });

  it('keeps a house number whether it sits before the town or after it', () => {
    expect(splitPlace('סוקולוב 12 הרצליה')).toMatchObject({
      street: 'סוקולוב',
      house: '12',
      city: 'הרצליה',
    });
    expect(splitPlace('סוקולוב הרצליה 12')).toMatchObject({
      street: 'סוקולוב',
      house: '12',
      city: 'הרצליה',
    });
  });

  it('accepts the short name of a town whose official name is longer', () => {
    expect(splitPlace('הרצל תל אביב')).toMatchObject({
      street: 'הרצל',
      city: 'תל אביב',
      separated: true,
    });
  });

  it('still marks a two-word street whose last word begins a town, so both can be offered', () => {
    expect(splitPlace('שדרות הרצל')).toEqual({
      street: 'שדרות',
      house: '',
      city: 'הרצל',
      separated: true,
      loose: true,
    });
  });

  it('treats a bare town, and a street with only a number, as one piece', () => {
    expect(splitPlace('הרצליה').separated).toBe(false);
    expect(splitPlace('סוקולוב 12')).toEqual({
      street: 'סוקולוב',
      house: '12',
      city: '',
      separated: false,
      loose: false,
    });
  });
});
