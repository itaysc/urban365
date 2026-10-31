/**
 * An Israeli phone number as WhatsApp wants it: digits, country code, no plus.
 *
 * `052-333-4444` and `+972 52 333 4444` and `972523334444` are one number written three
 * ways, and only the last is a `wa.me` link. Returns null for anything that does not
 * look like a number we can place, because a wrong link opens a chat with a stranger.
 */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');

  // Already international, with or without the leading zeros of a dialled prefix.
  if (digits.startsWith('972')) {
    const rest = digits.slice(3).replace(/^0+/, '');
    return rest.length >= 8 ? `972${rest}` : null;
  }

  // The local form: a leading 0 that the country code replaces.
  if (digits.startsWith('0')) {
    const rest = digits.slice(1);
    return rest.length >= 8 ? `972${rest}` : null;
  }

  // Nine digits with no prefix at all is how people write their own mobile when asked
  // for it quickly. Anything shorter is not a number, and anything longer is not ours.
  return digits.length === 9 ? `972${digits}` : null;
}

/** The link that opens WhatsApp with the message ready — and not yet sent. */
export function waLink(phone: string | null | undefined, text: string): string | null {
  const number = waNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}
