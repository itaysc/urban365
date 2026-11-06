import { api } from '@/services/api';

/**
 * The reasons the public form offers. The server rejects anything else, so this
 * list and `ENQUIRY_REASONS` in `agency-enquiry.dto.ts` have to stay the same.
 */
export const ENQUIRY_REASONS = [
  'רכישת נכס',
  'השכרת נכס',
  'מכירת נכס',
  'הערכת שווי',
  'אחר',
] as const;

export type EnquiryReason = (typeof ENQUIRY_REASONS)[number];

export interface PublicAgencyCard {
  id: string;
  slug: string | null;
  name: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  city: string | null;
  listingCount: number;
}

export interface AgencyDirectory {
  regions: { name: string; agencies: PublicAgencyCard[] }[];
}

export interface PublicOffice {
  id: string;
  label: string | null;
  city: string;
  street: string | null;
  houseNumber: number | null;
  phone: string | null;
}

export interface PublicBroker {
  id: string;
  name: string;
  licenseNumber: string | null;
  specialization: string | null;
  avatarUrl: string | null;
  activeAssetsCount: number | null;
}

export interface PublicAgency {
  id: string;
  slug: string | null;
  name: string;
  licenseNumber: string | null;
  phone: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  description: string | null;
  openingHours: { day: string; open: string; close: string }[];
  offices: PublicOffice[];
  brokers: PublicBroker[];
  counts: { forsale: number; rent: number; commercial: number };
}

/** Slug when the agency has one, otherwise its id. Both resolve on the server. */
export function agencyPublicPath(agency: { id: string; slug: string | null }): string {
  return `/agencies/${agency.slug ?? agency.id}`;
}

export async function fetchAgencyDirectory(): Promise<AgencyDirectory> {
  const { data } = await api.get<AgencyDirectory>('/agencies');
  return data;
}

export async function fetchPublicAgency(key: string): Promise<PublicAgency> {
  const { data } = await api.get<PublicAgency>(`/agencies/${encodeURIComponent(key)}`);
  return data;
}

export async function submitAgencyEnquiry(
  key: string,
  input: { name: string; phone?: string; email?: string; message?: string; reason?: EnquiryReason },
): Promise<void> {
  await api.post(`/agencies/${encodeURIComponent(key)}/enquiries`, input);
}
