import { api } from '@/services/api';
import type { AgencyLookupResult } from '@/services/auth';

export interface PreviewListing {
  id: string;
  section: 'forsale' | 'rent' | 'commercial';
  price: number | null;
  rooms: number | null;
  squareMeter: number | null;
  floor: number | null;
  buildingTopFloor: number | null;
  propertyType: string | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
}

export interface AgencyPreview {
  agency: { id: string; name: string; phone: string | null; licenseNumber: string | null };
  live: boolean;
  pending: boolean;
  publicPath: string | null;
  listings: PreviewListing[];
}

export async function fetchAgencyPreview(token: string): Promise<AgencyPreview> {
  const { data } = await api.get<AgencyPreview>(`/agencies/preview/${encodeURIComponent(token)}`);
  return data;
}

/** The office a preview link stands for, in the shape the agency picker holds. */
export function claimFromPreview(preview: AgencyPreview): AgencyLookupResult {
  return {
    id: preview.agency.id,
    name: preview.agency.name,
    licenseNumber: preview.agency.licenseNumber,
    city: preview.listings.find((listing) => listing.city)?.city ?? null,
    listingCount: preview.listings.length,
  };
}
