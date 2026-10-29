import type { Amenity } from '@/types/yad2';

/**
 * A listing the agency holds exclusively. The server stores it as a column and keeps
 * the matching Hebrew label in the amenity list, because the two payloads carry it
 * differently: a search card has labels, the detail Asset has yad2's keyed flags.
 * Both spellings live here so no screen invents a third.
 */
export const EXCLUSIVE_LABEL = 'בלעדיות';
export const EXCLUSIVE_KEY = 'isAssetExclusive';

/** For a search card, whose amenities are plain labels. */
export const isExclusiveListing = (amenities: string[]): boolean => amenities.includes(EXCLUSIVE_LABEL);

/** For the detail Asset, whose amenities are yad2's flags. */
export const isExclusiveAsset = (amenities: Amenity[]): boolean =>
  amenities.some((a) => a.key === EXCLUSIVE_KEY && a.present);
