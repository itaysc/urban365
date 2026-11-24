import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * An Israeli number a person can call, or null.
 *
 * `libphonenumber-js` checks the Israeli numbering plan, so nine digits of anything
 * is not enough. A leading 972 with no plus is accepted too: that is how the number
 * is often pasted. The text the person typed is what is kept.
 */
export function keptPhone(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  const candidates = digits.startsWith('972') ? [trimmed, `+${digits}`] : [trimmed];
  for (const candidate of candidates) {
    const parsed = parsePhoneNumberFromString(candidate, 'IL');
    if (parsed?.isValid() && parsed.country === 'IL') return trimmed;
  }
  return null;
}
