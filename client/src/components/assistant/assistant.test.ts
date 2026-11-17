import { describe, expect, it } from 'vitest';
import { displayChatText, formatChatDate } from './assistant';

describe('chat dates', () => {
  it('shows an ISO day as DD/MM/YYYY', () => {
    expect(formatChatDate('2024-06-01')).toBe('01/06/2024');
    expect(displayChatText('נמכרה ב-2024-06-01 ליד הרחוב')).toBe('נמכרה ב-01/06/2024 ליד הרחוב');
  });

  it('leaves a year and a price alone', () => {
    expect(displayChatText('ב-2024 החציון 1,900,000 ₪')).toBe('ב-2024 החציון 1,900,000 ₪');
  });
});
