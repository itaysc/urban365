import type { SellerListingInput } from '@/services/seller';

/**
 * Everything the form can change, in a fixed order, as one comparable string.
 *
 * A fixed list rather than whatever keys happen to be on the object: an absent key and
 * a key set to undefined are the same thing to a person and must compare equal, and
 * key order is not guaranteed. Amenities are sorted because they are a set — turning
 * one off and on again is not a change.
 */
export const COMPARED: (keyof SellerListingInput)[] = [
  'section',
  'city',
  'street',
  'houseNumber',
  'neighborhood',
  'price',
  'rooms',
  'squareMeter',
  'floor',
  'buildingTopFloor',
  'parkingSpacesCount',
  'propertyType',
  'description',
  'contactName',
];

export const snapshot = (form: SellerListingInput, amenities: string[]) =>
  JSON.stringify([
    ...COMPARED.map((key) => form[key] ?? null),
    [...amenities].sort(),
  ]);
