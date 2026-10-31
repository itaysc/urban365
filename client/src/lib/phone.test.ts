import { describe, expect, it } from 'vitest';
import { sanitisePhone, waLink, waNumber } from './phone';

describe('waNumber', () => {
  it('turns a local mobile into an international one', () => {
    expect(waNumber('052-333-4444')).toBe('972523334444');
  });

  it('ignores spaces, dashes and a leading plus', () => {
    expect(waNumber('+972 52 333 4444')).toBe('972523334444');
  });

  it('does not add the country code twice', () => {
    expect(waNumber('972523334444')).toBe('972523334444');
  });

  it('drops the trunk zero after a country code somebody left in', () => {
    expect(waNumber('+972-052-333-4444')).toBe('972523334444');
  });

  it('accepts nine digits with no prefix, which is how people type their own', () => {
    expect(waNumber('523334444')).toBe('972523334444');
  });

  it('is null for something too short to be a number', () => {
    expect(waNumber('1234')).toBeNull();
  });

  it('is null for nothing at all, rather than a link to nowhere', () => {
    expect(waNumber(null)).toBeNull();
    expect(waNumber('')).toBeNull();
  });
});

describe('waLink', () => {
  it('carries the message, encoded', () => {
    expect(waLink('052-333-4444', 'שלום דני')).toBe(
      'https://wa.me/972523334444?text=%D7%A9%D7%9C%D7%95%D7%9D%20%D7%93%D7%A0%D7%99',
    );
  });

  it('is null when there is no number to open a chat with', () => {
    expect(waLink(null, 'שלום')).toBeNull();
  });
});

describe('sanitisePhone', () => {
  it('keeps the way people actually write a number', () => {
    expect(sanitisePhone('+972 (0)52-123-4567')).toBe('+972 (0)52-123-4567');
  });

  it('drops letters, which is the whole point', () => {
    expect(sanitisePhone('052abc1234567')).toBe('0521234567');
  });

  it('drops Hebrew too, not just the Latin alphabet', () => {
    expect(sanitisePhone('דני 052-1234567')).toBe(' 052-1234567');
  });

  it('cuts a paste of nonsense down to something a field can hold', () => {
    expect(sanitisePhone('1'.repeat(80))).toHaveLength(24);
  });

  it('leaves an empty field empty rather than inventing a prefix', () => {
    expect(sanitisePhone('')).toBe('');
  });
});
