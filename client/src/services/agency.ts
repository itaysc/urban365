import { api } from '@/services/api';

export type ListingStatus = 'draft' | 'published' | 'archived';

export interface MyListing {
  id: string;
  token: string | null;
  status: ListingStatus;
  section: string;
  price: number | null;
  rooms: number | null;
  squareMeter: number | null;
  city: string | null;
  street: string | null;
  coverImageUrl: string | null;
  updatedAt: string;
}

export interface MyListingsPage {
  items: MyListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function fetchMyListings(params: {
  status?: ListingStatus;
  page?: number;
} = {}): Promise<MyListingsPage> {
  const { data } = await api.get<MyListingsPage>('/my/listings', { params });
  return data;
}

// ── listing write ─────────────────────────────────────────────────────────────

export interface ListingImage {
  id: string;
  url: string;
  storageKey: string;
  width: number | null;
  height: number | null;
  position: number;
}

export interface ListingDetail extends MyListing {
  section: string;
  propertyType: string | null;
  propertyCondition: string | null;
  neighborhood: string | null;
  houseNumber: number | null;
  floor: number | null;
  buildingTopFloor: number | null;
  balconiesCount: number | null;
  parkingSpacesCount: number | null;
  amenities: string[];
  tags: string[];
  description: string | null;
  contactName: string | null;
  brokerName: string | null;
  publishedAt: string | null;
  images: ListingImage[];
}

export interface ListingInput {
  section: string;
  status?: ListingStatus;
  price?: number;
  rooms?: number;
  squareMeter?: number;
  floor?: number;
  buildingTopFloor?: number;
  balconiesCount?: number;
  parkingSpacesCount?: number;
  propertyType?: string;
  propertyCondition?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
  houseNumber?: number;
  amenities?: string[];
  description?: string;
  contactName?: string;
  brokerName?: string;
}

export async function fetchListing(id: string): Promise<ListingDetail> {
  const { data } = await api.get<ListingDetail>(`/my/listings/${id}`);
  return data;
}

export async function createListing(input: ListingInput): Promise<ListingDetail> {
  const { data } = await api.post<ListingDetail>('/my/listings', input);
  return data;
}

export async function updateListing(id: string, input: Partial<ListingInput>): Promise<ListingDetail> {
  const { data } = await api.patch<ListingDetail>(`/my/listings/${id}`, input);
  return data;
}

export const archiveListing = (id: string) => api.delete(`/my/listings/${id}`);

// ── images ────────────────────────────────────────────────────────────────────

interface Presigned {
  uploadUrl: string;
  storageKey: string;
  url: string;
}

/**
 * Presign, PUT straight to Backblaze, then tell the API the key. The bytes never go
 * through our server, so a twenty-photo upload costs it three small JSON calls.
 *
 * The PUT uses bare fetch rather than the api client: it is cross-origin to the bucket,
 * and sending our credentials or the CSRF header there would be both pointless and wrong.
 */
export async function uploadListingImage(listingId: string, file: File): Promise<ListingDetail> {
  const { data: presigned } = await api.post<Presigned>(`/my/listings/${listingId}/images/presign`, {
    contentType: file.type,
  });

  const put = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);

  const size = await readImageSize(file).catch(() => null);
  await api.post(`/my/listings/${listingId}/images`, {
    storageKey: presigned.storageKey,
    ...(size ?? {}),
  });

  return fetchListing(listingId);
}

/** Dimensions are read here because the server never sees the bytes. */
function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not read image'));
    };
    img.src = url;
  });
}

export async function removeListingImage(listingId: string, imageId: string): Promise<ListingDetail> {
  const { data } = await api.delete<ListingDetail>(`/my/listings/${listingId}/images/${imageId}`);
  return data;
}

export async function reorderListingImages(listingId: string, imageIds: string[]): Promise<ListingDetail> {
  const { data } = await api.patch<ListingDetail>(`/my/listings/${listingId}/images/order`, { imageIds });
  return data;
}

// ── agency profile ────────────────────────────────────────────────────────────

export interface AgencyProfile {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  description: string | null;
  phone: string | null;
  contactEmail: string | null;
  licenseNumber: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  _count: { listings: number; leads: number; deals: number };
}

export async function fetchAgencyProfile(): Promise<AgencyProfile> {
  const { data } = await api.get<AgencyProfile>('/my/agency');
  return data;
}

export async function updateAgencyProfile(input: Partial<AgencyProfile>) {
  const { data } = await api.patch<AgencyProfile>('/my/agency', input);
  return data;
}

/** Same two-step upload as listing photos, into the agency's own prefix. */
export async function uploadAgencyCover(file: File): Promise<AgencyProfile> {
  const { data: presigned } = await api.post<Presigned>('/my/agency/cover/presign', {
    contentType: file.type,
  });

  const put = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);

  return updateAgencyProfile({ coverImageUrl: presigned.url });
}
