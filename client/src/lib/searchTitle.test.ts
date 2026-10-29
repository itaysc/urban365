import { describe, expect, it } from 'vitest';
import { searchTitle, singlePlace } from '@/lib/searchTitle';

const base = { section: 'forsale' as const, city: [] as string[], neighborhood: [] as string[] };

describe('searchTitle', () => {
  it('names a single city', () => {
    expect(searchTitle({ ...base, city: ['חולון'] })).toBe('נדל״ן למכירה בחולון');
  });

  it('names a neighbourhood with its city, which choosing one always adds', () => {
    expect(searchTitle({ ...base, city: ['חולון'], neighborhood: ['נאות רחל'] })).toBe(
      'נדל״ן למכירה בנאות רחל, חולון',
    );
  });

  it('says there are several rather than listing them', () => {
    expect(searchTitle({ ...base, city: ['חולון', 'בת ים'] })).toBe('נדל״ן למכירה במיקומים שנבחרו');
    expect(searchTitle({ ...base, city: ['חולון'], neighborhood: ['נאות רחל', 'אגרובנק'] })).toBe(
      'נדל״ן למכירה במיקומים שנבחרו',
    );
  });

  it('drops the place entirely when none is chosen', () => {
    expect(searchTitle(base)).toBe('נדל״ן למכירה');
  });

  it('follows the section', () => {
    expect(searchTitle({ ...base, section: 'rent', city: ['רחובות'] })).toBe('נדל״ן להשכרה ברחובות');
    expect(searchTitle({ ...base, section: 'commercial', city: ['רחובות'] })).toBe(
      'נדל״ן מסחרי ברחובות',
    );
  });

  it('falls back to the sale wording when no section is set', () => {
    expect(searchTitle({ ...base, section: undefined, city: ['רחובות'] })).toBe(
      'נדל״ן למכירה ברחובות',
    );
  });
});

describe('singlePlace', () => {
  it('still reads as one place when the city chip was removed by hand', () => {
    expect(singlePlace({ ...base, neighborhood: ['נאות רחל'] })).toBe('נאות רחל');
  });

  it('is null for none and for several', () => {
    expect(singlePlace(base)).toBeNull();
    expect(singlePlace({ ...base, city: ['חולון', 'בת ים'] })).toBeNull();
  });
});
