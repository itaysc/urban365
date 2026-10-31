import { api } from '@/services/api';

export const MEETING_STATUSES = ['scheduled', 'done', 'cancelled'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface Meeting {
  /** How it went, once somebody has written it up. */
  outcome: ViewingOutcome | null;
  feedbackNotes: string | null;
  feedbackAt: string | null;

  /** What the customer said, and whether they were asked at all. */
  attendeeResponse: AttendeeResponse;
  attendeeRespondedAt: string | null;
  confirmationSentAt: string | null;
  reminderSentAt: string | null;
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

// ── confirmations ────────────────────────────────────────────────────────────

export type AttendeeResponse = 'pending' | 'confirmed' | 'declined';

/** Asks the customer to confirm. `sent: false` means there was nobody to email. */
export async function sendMeetingConfirmation(
  id: string,
): Promise<{ sent: boolean; reason?: string }> {
  const { data } = await api.post<{ sent: boolean; reason?: string }>(
    `/my/meetings/${id}/confirmation`,
  );
  return data;
}

/** What the customer sees behind the link in their email. */
export interface ViewingInvite {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  cancelled: boolean;
  response: AttendeeResponse;
  agencyName: string;
  agencyPhone: string | null;
  firstName: string | null;
}

export async function fetchViewing(token: string): Promise<ViewingInvite> {
  const { data } = await api.get<ViewingInvite>(`/viewings/${token}`);
  return data;
}

export async function respondToViewing(token: string, confirmed: boolean): Promise<void> {
  await api.post(`/viewings/${token}/${confirmed ? 'confirm' : 'decline'}`);
}

// ── after the viewing ────────────────────────────────────────────────────────

export const VIEWING_OUTCOMES = ['interested', 'thinking', 'not_interested', 'no_show'] as const;
export type ViewingOutcome = (typeof VIEWING_OUTCOMES)[number];

/**
 * Writing up a viewing. Also what marks the meeting done — an agent who has said how
 * it went has said that it happened.
 */
export const recordViewingFeedback = (id: string, outcome: ViewingOutcome, notes?: string) =>
  api.post<Meeting>(`/my/meetings/${id}/feedback`, { outcome, notes });

/** Past viewings nobody has written up yet. */
export async function fetchAwaitingFeedback(): Promise<Meeting[]> {
  const { data } = await api.get<Meeting[]>('/my/meetings/awaiting-feedback');
  return data;
}
