import { describe, expect, it } from 'vitest';
import { keptPhone } from './phone.js';

describe('keptPhone', () => {
  it('keeps an Israeli mobile, a landline, and the international form', () => {
    expect(keptPhone('052-1234567')).toBe('052-1234567');
    expect(keptPhone('03-1234567')).toBe('03-1234567');
    expect(keptPhone('+972 52 123 4567')).toBe('+972 52 123 4567');
    expect(keptPhone('972521234567')).toBe('972521234567');
  });

  it('refuses a fragment, a run of digits, and a number from another country', () => {
    expect(keptPhone('12345')).toBeNull();
    expect(keptPhone('123456789')).toBeNull();
    expect(keptPhone('000-0000000')).toBeNull();
    expect(keptPhone('+1 202 555 0123')).toBeNull();
    expect(keptPhone('')).toBeNull();
    expect(keptPhone(null)).toBeNull();
  });
});
