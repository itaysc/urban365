import { api } from '@/services/api';

export type CoBrokerageStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

export const CO_BROKERAGE_STAGES = [
  'agreed',
  'viewing',
  'negotiating',
  'signed',
  'completed',
  'fell_through',
] as const;

export type CoBrokerageStage = (typeof CO_BROKERAGE_STAGES)[number];

export interface CoBrokerageMessage {
  id: string;
  body: string;
  createdAt: string;
  /** Which side wrote it — compared against our own agency id to tell us from them. */
  agencyId: string;
  author: { firstName: string; lastName: string } | null;
}

interface CoBrokeListing {
  id: string;
  city: string | null;
  street: string | null;
  houseNumber: number | null;
  rooms: number | null;
  price: number | null;
  squareMeter: number | null;
  propertyType: string | null;
  coverImageUrl: string | null;
}

interface CoBrokeAgency {
  id: string;
  name: string;
  phone: string | null;
  logoUrl: string | null;
}

/** A request we sent. Carries our own customer, because they are ours. */
export interface SentRequest {
  id: string;
  status: CoBrokerageStatus;
  stage: CoBrokerageStage | null;
  message: string | null;
  commissionSplit: number;
  briefSummary: string | null;
  createdAt: string;
  respondedAt: string | null;
  messages: CoBrokerageMessage[];
  listing: CoBrokeListing;
  holdingAgency: CoBrokeAgency;
  customer: { id: string; name: string; phone: string | null } | null;
  /** When we last read the thread. The other side's mark is not ours to see. */
  seekerReadAt: string | null;
}

/**
 * A request we received. Note what is not here: no customer, by design.
 *
 * The brief says what they are after; who they are and what they can afford stays with
 * the agency that has them, until that agency chooses otherwise.
 */
export interface ReceivedRequest {
  id: string;
  status: CoBrokerageStatus;
  stage: CoBrokerageStage | null;
  message: string | null;
  commissionSplit: number;
  briefSummary: string | null;
  createdAt: string;
  respondedAt: string | null;
  messages: CoBrokerageMessage[];
  listing: CoBrokeListing;
  seekingAgency: CoBrokeAgency;
  holderReadAt: string | null;
}

export async function fetchSentRequests(): Promise<SentRequest[]> {
  const { data } = await api.get<SentRequest[]>('/my/cobrokerage/sent');
  return data;
}

export async function fetchReceivedRequests(): Promise<ReceivedRequest[]> {
  const { data } = await api.get<ReceivedRequest[]>('/my/cobrokerage/received');
  return data;
}

export async function requestCoBrokerage(input: {
  listingId: string;
  customerId: string;
  message?: string;
  commissionSplit?: number;
}): Promise<SentRequest> {
  const { data } = await api.post<SentRequest>('/my/cobrokerage', input);
  return data;
}

export const setCoBrokerageStage = (id: string, stage: CoBrokerageStage) =>
  api.post(`/my/cobrokerage/${id}/stage`, { stage });

export const postCoBrokerageMessage = (id: string, body: string) =>
  api.post(`/my/cobrokerage/${id}/messages`, { body });

export const markCoBrokerageRead = (id: string) => api.post(`/my/cobrokerage/${id}/read`);

export const acceptCoBrokerage = (id: string) => api.post(`/my/cobrokerage/${id}/accept`);
export const declineCoBrokerage = (id: string) => api.post(`/my/cobrokerage/${id}/decline`);
export const withdrawCoBrokerage = (id: string) => api.post(`/my/cobrokerage/${id}/withdraw`);
