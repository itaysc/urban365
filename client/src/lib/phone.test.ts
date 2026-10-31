import { describe, expect, it } from 'vitest';
import { waLink, waNumber } from './phone';

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
