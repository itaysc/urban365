import { api } from '@/services/api';
import type { AuthUser, SignupInput } from '@/types/auth';

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const { data } = await api.get<{ user: AuthUser }>('/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { data } = await api.post<{ user: AuthUser }>('/auth/login', { email, password });
  return data.user;
}

export async function signup(input: SignupInput): Promise<AuthUser> {
  const { data } = await api.post<{ user: AuthUser }>('/auth/signup', input);
  return data.user;
}

export interface BuyerSignupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  /** The server rejects anything but true — see the note on the DTO. */
  acceptedTerms: boolean;
}

/** Consumer signup. Separate endpoint from the agency one — different required fields. */
export async function signupBuyer(input: BuyerSignupInput): Promise<AuthUser> {
  const { data } = await api.post<{ user: AuthUser }>('/auth/signup/buyer', input);
  return data.user;
}

export const logout = () => api.post('/auth/logout');
export const forgotPassword = (email: string) => api.post('/auth/forgot-password', { email });
export const resetPassword = (token: string, password: string) =>
  api.post('/auth/reset-password', { token, password });
export const resendVerification = () => api.post('/auth/resend-verification');

export interface AgencyLookupResult {
  id: string;
  name: string;
  licenseNumber: string | null;
  city: string | null;
  listingCount: number;
}

export async function lookupAgencies(q: string): Promise<AgencyLookupResult[]> {
  const { data } = await api.get<AgencyLookupResult[]>(`/agencies/lookup?q=${encodeURIComponent(q)}`);
  return data;
}
