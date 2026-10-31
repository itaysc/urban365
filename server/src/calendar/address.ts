/** The parts of an address a listing can have. Any of them may be missing. */
export interface AddressParts {
  street: string | null;
  houseNumber: number | null;
  city: string | null;
}

/**
 * "סוקולוב 15, חולון" from whatever parts there are.
 *
 * Used in the email that asks a property's owner to approve a viewing, where it is the
 * only thing identifying which of their properties is meant. A scraped listing often
 * has a city and nothing else, so every part is optional and the result is null rather
 * than a stray comma when there is nothing to say.
 */
export function addressOf(listing: AddressParts): string | null {
  const street = [listing.street, listing.houseNumber].filter(Boolean).join(' ');
  const parts = [street, listing.city].filter((part) => part !== '' && part !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}
