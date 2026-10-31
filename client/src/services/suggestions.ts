import { api } from '@/services/api';

export type SuggestionKind = 'new_match';
export type SuggestionStatus = 'open' | 'done' | 'dismissed';

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  status: SuggestionStatus;
  /** 0–100: how strong the evidence is, not how urgent the task. */
  score: number;
  /** Why it appeared, written by the rule that raised it. */
  reason: string;
  createdAt: string;
  ownerId: string | null;
  /** The message to this customer, once somebody has asked for one. */
  draft: string | null;
  draftAt: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  listing: {
    id: string;
    city: string | null;
    street: string | null;
    houseNumber: number | null;
    rooms: number | null;
    price: number | null;
    squareMeter: number | null;
    coverImageUrl: string | null;
  } | null;
  owner: { id: string; firstName: string; lastName: string } | null;
}

export async function fetchSuggestions(ownerId?: string): Promise<Suggestion[]> {
  const search = new URLSearchParams();
  if (ownerId) search.set('ownerId', ownerId);

  const { data } = await api.get<Suggestion[]>(`/my/suggestions?${search}`);
  return data;
}

/** Runs the match now instead of waiting for the hourly sweep. */
export async function refreshSuggestions(): Promise<{ raised: number }> {
  const { data } = await api.post<{ raised: number }>('/my/suggestions/refresh');
  return data;
}

/** Writes the message. Sends nothing — the draft comes back for the agent to use. */
export async function draftSuggestionMessage(id: string): Promise<Suggestion> {
  const { data } = await api.post<Suggestion>(`/my/suggestions/${id}/draft`);
  return data;
}

/** Keeps what the agent made of it. `''` throws it away. */
export async function saveSuggestionDraft(id: string, draft: string): Promise<Suggestion> {
  const { data } = await api.post<Suggestion>(`/my/suggestions/${id}/draft/save`, { draft });
  return data;
}

export const markSuggestionDone = (id: string) => api.post(`/my/suggestions/${id}/done`);
export const dismissSuggestion = (id: string) => api.post(`/my/suggestions/${id}/dismiss`);
