import { describe, expect, it } from 'vitest';
import { displayChatText, formatChatDate, stickAfterScroll } from './assistant';

describe('chat dates', () => {
  it('shows an ISO day as DD/MM/YYYY', () => {
    expect(formatChatDate('2024-06-01')).toBe('01/06/2024');
    expect(displayChatText('נמכרה ב-2024-06-01 ליד הרחוב')).toBe('נמכרה ב-01/06/2024 ליד הרחוב');
  });

  it('leaves a year and a price alone', () => {
    expect(displayChatText('ב-2024 החציון 1,900,000 ₪')).toBe('ב-2024 החציון 1,900,000 ₪');
  });
});

describe('stickAfterScroll', () => {
  it('follows again once the reader is back at the bottom', () => {
    expect(stickAfterScroll(100, 200, 100, false)).toBe(true);
  });

  it('lets go once the reader has moved up', () => {
    expect(stickAfterScroll(0, 400, 100, true)).toBe(false);
  });

  it('does not grab a reader back during the first pixels of a scroll', () => {
    expect(stickAfterScroll(90, 200, 100, false)).toBe(false);
  });
});
