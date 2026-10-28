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
