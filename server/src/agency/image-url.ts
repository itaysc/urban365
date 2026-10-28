/**
 * The stable, public path an image is served from. Stored on the row so search results
 * and the detail modal can use it directly without knowing anything about the bucket.
 *
 * Deliberately a path rather than an absolute URL: the API host differs between local,
 * staging and production, and baking it into a column would make the rows wrong the
 * moment the host changed.
 */
export const listingImageUrl = (imageId: string): string => `/api/v1/listings/images/${imageId}`;

export const agencyCoverUrl = (agencyId: string, version: string): string =>
  `/api/v1/agencies/${agencyId}/cover?v=${version}`;
