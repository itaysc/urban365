import { api } from '@/services/api';

export const MEETING_STATUSES = ['scheduled', 'done', 'cancelled'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface Meeting {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  notes: string | null;
  status: MeetingStatus;
  customerId: string | null;
  listingId: string | null;
  ownerId: string | null;
  googleEventId: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  listing: { id: string; city: string | null; street: string | null; houseNumber: number | null } | null;
  owner: { id: string; firstName: string; lastName: string } | null;
}

/** Somebody's own Google event, shown beside ours and never edited here. */
export interface GoogleEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
}

export interface MeetingInput {
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  notes?: string;
  customerId?: string;
  listingId?: string;
  status?: MeetingStatus;
}

export async function fetchMeetings(params: {
  from: string;
  to: string;
  customerId?: string;
  /**
   * A user id, or `'all'` for the whole team. Absent means your own.
   *
   * Only an owner may ask for anything but their own; the server refuses an agent.
   * Google events are never anybody else's — they come from your own connected
   * account, so a team view shows colleagues' *meetings*, not their private diaries.
   */
  ownerId?: string;
  google?: boolean;
}): Promise<{ items: Meeting[]; googleEvents: GoogleEvent[] }> {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.customerId) search.set('customerId', params.customerId);
  if (params.ownerId) search.set('ownerId', params.ownerId);
  if (params.google) search.set('google', '1');

  const { data } = await api.get<{ items: Meeting[]; googleEvents: GoogleEvent[] }>(
    `/my/meetings?${search}`,
  );
  return data;
}

export const createMeeting = (input: MeetingInput) => api.post<Meeting>('/my/meetings', input);
export const updateMeeting = (id: string, input: Partial<MeetingInput>) =>
  api.patch<Meeting>(`/my/meetings/${id}`, input);
export const deleteMeeting = (id: string) => api.delete(`/my/meetings/${id}`);

export interface GoogleCalendarStatus {
  connected: boolean;
  /** False when the server has no Google credentials at all — then there is nothing to offer. */
  available: boolean;
  googleEmail?: string;
  calendarId?: string;
  connectedAt?: string;
  lastError?: string | null;
  lastSyncAt?: string | null;
}

export async function fetchGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const { data } = await api.get<GoogleCalendarStatus>('/my/calendar/google/status');
  return data;
}

export const disconnectGoogleCalendar = () => api.delete('/my/calendar/google');
