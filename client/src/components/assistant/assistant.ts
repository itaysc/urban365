import { apiBaseUrl } from '@/services/api';

export type AssistantAgentId = 'end-user' | 'agency';

export interface AgentPageContext {
  kind: 'customer' | 'lead' | 'deal' | 'listing' | 'calendar' | 'page';
  id?: string;
  path: string;
}

export type AssistantCard =
  | {
      type: 'listing';
      id: string;
      href: string;
      title: string;
      price: number | null;
      rooms: number | null;
      sqm: number | null;
      city: string | null;
    }
  | { type: 'mortgage'; monthly: number; loan: number; years: number; note: string }
  | { type: 'valuation'; low: number | null; high: number | null; verdict: string; city: string }
  | { type: 'link'; href: string; label: string }
  | {
      type: 'price-history';
      city: string;
      street: string;
      radiusMetres: number;
      rooms?: number | null;
      years: { year: number; count: number; median: number; perSqm: number | null }[];
      recent: { date: string; amount: number; rooms: number | null; area: number | null; perSqm: number | null }[];
      asking?: { count: number; median: number; perSqm: number | null } | null;
    }
  | {
      type: 'customer';
      id: string;
      href: string;
      name: string;
      kind: string | null;
      phone: string | null;
      email: string | null;
    }
  | {
      type: 'deal';
      id: string;
      href: string;
      title: string;
      stage: string;
      price: number | null;
      customerName: string | null;
    }
  | {
      type: 'meeting';
      id: string;
      href: string;
      title: string;
      startsAt: string;
      customerName: string | null;
      location: string | null;
    }
  | {
      type: 'lead';
      id: string;
      href: string;
      name: string;
      status: string;
      phone: string | null;
      email: string | null;
      listingLabel: string | null;
    }
  | {
      type: 'confirm';
      toolCallId: string;
      toolName: string;
      label: string;
      detail: string;
      status: 'pending' | 'done' | 'cancelled';
    };

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  cards: AssistantCard[];
  needsSignIn: boolean;
}

/** `2024-06-01` becomes `01/06/2024`. Anything that is not a calendar day is left as written. */
export function displayChatText(text: string): string {
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, year: string, month: string, day: string) => {
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return match;
    return `${day}/${month}/${year}`;
  });
}

/**
 * Whether new text should keep pulling the log down.
 *
 * Far from the bottom means the reader moved up and must be left there. Back at the
 * bottom means they want to follow again. A small gap keeps the previous choice, so
 * a layout rounding does not cancel a scroll that has already let go.
 */
export function stickAfterScroll(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  currentlyStuck: boolean,
): boolean {
  const distance = scrollHeight - scrollTop - clientHeight;
  if (distance > 48) return false;
  if (distance <= 1) return true;
  return currentlyStuck;
}

/** The day of an ISO date, as `DD/MM/YYYY`, without shifting it across a timezone. */
export function formatChatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function conversationKey(agentId: AssistantAgentId): string {
  return `nadlan:assistant:${agentId}`;
}

function openKey(agentId: AssistantAgentId): string {
  return `nadlan:assistant:open:${agentId}`;
}

export function storedConversationId(agentId: AssistantAgentId = 'end-user'): string | null {
  try {
    return window.localStorage.getItem(conversationKey(agentId));
  } catch {
    return null;
  }
}

export function rememberConversation(id: string, agentId: AssistantAgentId = 'end-user'): void {
  try {
    window.localStorage.setItem(conversationKey(agentId), id);
  } catch {
    // A chat that cannot be resumed is still a chat.
  }
}

export function storedAssistantOpen(agentId: AssistantAgentId = 'end-user'): boolean {
  try {
    return window.localStorage.getItem(openKey(agentId)) === '1';
  } catch {
    return false;
  }
}

export function rememberAssistantOpen(open: boolean, agentId: AssistantAgentId = 'end-user'): void {
  try {
    window.localStorage.setItem(openKey(agentId), open ? '1' : '0');
  } catch {
    // The panel still opens. It just will not be open on the next page.
  }
}

export function forgetConversation(agentId: AssistantAgentId = 'end-user'): void {
  try {
    window.localStorage.removeItem(conversationKey(agentId));
  } catch {
    // Nothing to clear is not a failure.
  }
}

/** Deletes this browser's transcript on the server. The panel forgets its id only after this succeeds. */
export async function clearHistory(agentId: AssistantAgentId = 'end-user'): Promise<boolean> {
  const response = await fetch(`${apiBaseUrl}/agents/${agentId}/conversations`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  return response.ok;
}

export async function loadConversation(
  id: string,
  agentId: AssistantAgentId = 'end-user',
): Promise<AssistantMessage[] | null> {
  const response = await fetch(`${apiBaseUrl}/agents/${agentId}/conversations/${id}`, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { messages: AssistantMessage[] };
  return body.messages;
}

export interface AssistantEvents {
  onReady: (conversationId: string) => void;
  onText: (delta: string) => void;
  onCards: (cards: AssistantCard[]) => void;
  onSignIn: () => void;
  onError: (message: string) => void;
}

/** Sends one message and reads the event stream until the server closes it. */
export async function sendMessage(
  message: string,
  conversationId: string | null,
  events: AssistantEvents,
  signal?: AbortSignal,
  agentId: AssistantAgentId = 'end-user',
  page?: AgentPageContext | null,
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/agents/${agentId}/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      message,
      ...(conversationId ? { conversationId } : {}),
      ...(page ? { page } : {}),
    }),
    signal,
  });

  await readAgentStream(response, events);
}

/** אשר / בטל on a write that is waiting on a confirm card. */
export async function confirmTool(
  conversationId: string,
  toolCallId: string,
  accept: boolean,
  events: AssistantEvents,
  agentId: AssistantAgentId = 'agency',
  page?: AgentPageContext | null,
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/agents/${agentId}/confirm`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      conversationId,
      toolCallId,
      accept,
      ...(page ? { page } : {}),
    }),
  });

  await readAgentStream(response, events);
}

async function readAgentStream(response: Response, events: AssistantEvents): Promise<void> {
  if (response.status === 401 || response.status === 403) {
    events.onSignIn();
    return;
  }
  if (!response.ok || !response.body) {
    events.onError('משהו השתבש. נסה שוב.');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) dispatch(chunk, events);
  }
  if (buffer.trim()) dispatch(buffer, events);
}

function dispatch(chunk: string, events: AssistantEvents): void {
  let event = 'message';
  const data: string[] = [];
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return;

  const payload = JSON.parse(data.join('\n')) as Record<string, unknown>;
  if (event === 'ready' && typeof payload.conversationId === 'string') events.onReady(payload.conversationId);
  else if (event === 'text' && typeof payload.delta === 'string') events.onText(payload.delta);
  else if (event === 'cards' && Array.isArray(payload.cards)) events.onCards(payload.cards as AssistantCard[]);
  else if (event === 'sign_in') events.onSignIn();
  else if (event === 'error' && typeof payload.message === 'string') events.onError(payload.message);
}
