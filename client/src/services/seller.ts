import { api } from '@/services/api';
import type { ListingImage } from '@/services/agency';

export interface SellerListing {
  id: string;
  section: string;
  status: 'draft' | 'published' | 'archived';
  city: string | null;
  street: string | null;
  houseNumber: number | null;
  neighborhood: string | null;
  price: number | null;
  rooms: number | null;
  squareMeter: number | null;
  floor: number | null;
  buildingTopFloor: number | null;
  balconiesCount: number | null;
  parkingSpacesCount: number | null;
  propertyType: string | null;
  propertyCondition: string | null;
  amenities: string[];
  description: string | null;
  contactName: string | null;
  coverImageUrl: string | null;
  /**
   * What the spam check made of it. `flagged` is why a listing can be finished and
   * still not be live.
   */
  reviewStatus: 'unchecked' | 'clean' | 'flagged';
  reviewReason: string | null;
  latitude: number | null;
  images: ListingImage[];
}

export interface SellerListingInput {
  section: string;
  city: string;
  street?: string;
  houseNumber?: number;
  neighborhood?: string;
  price?: number;
  rooms?: number;
  squareMeter?: number;
  floor?: number;
  buildingTopFloor?: number;
  balconiesCount?: number;
  parkingSpacesCount?: number;
  propertyType?: string;
  propertyCondition?: string;
  amenities?: string[];
  description?: string;
  contactName?: string;
}

export interface ListingStats {
  listingId: string;
  /** Different people who opened it, not page loads. */
  views: number;
  phoneReveals: number;
  saves: number;
  enquiries: number;
}

/** What the server enforces; the form shows the same number so nobody is surprised. */
export const MAX_SELLER_IMAGES = 10;

export async function fetchMyListings(): Promise<SellerListing[]> {
  const { data } = await api.get<SellerListing[]>('/me/listings');
  return data;
}

export async function fetchMyListing(id: string): Promise<SellerListing> {
  const { data } = await api.get<SellerListing>(`/me/listings/${id}`);
  return data;
}

export async function fetchMyStats(): Promise<ListingStats[]> {
  const { data } = await api.get<ListingStats[]>('/me/listings/stats');
  return data;
}

/**
 * `acceptedTerms` only exists on the way in, and only here.
 *
 * The server refuses anything but true, for the reason every agreement is checked twice:
 * a tick box is a claim the client makes, and the record that somebody agreed is worth
 * no more than the weakest place it is enforced. Editing a listing does not ask again —
 * the agreement was given when it went up.
 */
export async function createMyListing(
  input: SellerListingInput & { acceptedTerms: boolean },
): Promise<SellerListing> {
  const { data } = await api.post<SellerListing>('/me/listings', input);
  return data;
}

export async function updateMyListing(id: string, input: SellerListingInput): Promise<SellerListing> {
  const { data } = await api.patch<SellerListing>(`/me/listings/${id}`, input);
  return data;
}

/** Off the market, kept. The figures and the enquiries still mean something. */
export async function archiveMyListing(id: string): Promise<void> {
  await api.post(`/me/listings/${id}/archive`);
}

export const REMOVAL_REASONS = [
  { value: 'sold', label: 'הנכס נמכר' },
  { value: 'rented', label: 'הנכס הושכר' },
  { value: 'regret', label: 'התחרטתי' },
  { value: 'other', label: 'סיבה אחרת' },
] as const;

export type RemovalReason = (typeof REMOVAL_REASONS)[number]['value'];

/**
 * Hidden from every listing. The row stays, with the reason they gave.
 *
 * A separate call from `archiveMyListing` on purpose: one can come back to the market
 * from the same screen, and the other is left out of the lists for good.
 */
export async function removeMyListing(id: string, reason: RemovalReason): Promise<void> {
  await api.post(`/me/listings/${id}/remove`, { reason });
}

/**
 * On the market: the last step of publishing a new listing, and the way back for one
 * taken down.
 *
 * Not always. A private seller's listing is read for spam here, and one that does not
 * look like a real property stays a draft — which is what `published: false` means. It
 * is not an error: the listing was saved, it is simply waiting for a person.
 */
export async function publishMyListing(id: string): Promise<{ published: boolean }> {
  const { data } = await api.post<{ published: boolean }>(`/me/listings/${id}/publish`);
  return data;
}

/**
 * `position` is the slot this photo should take.
 *
 * Sent because a new listing's photos go up together: without it the server would
 * number each one by how many rows exist when it arrives, which under concurrent
 * uploads is the same number for all of them — and the cover photo would be whichever
 * insert happened to win rather than the one the seller put first.
 */
export async function uploadMyListingImage(
  id: string,
  file: File,
  position?: number,
): Promise<ListingImage> {
  const form = new FormData();
  form.append('file', file);
  if (position !== undefined) form.append('position', String(position));
  const { data } = await api.post<ListingImage>(`/me/listings/${id}/images`, form);
  return data;
}

export async function deleteMyListingImage(id: string, imageId: string): Promise<void> {
  await api.delete(`/me/listings/${id}/images/${imageId}`);
}
