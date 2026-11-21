import { apiBaseUrl } from '@/services/api';

export type AssistantAgentId = 'end-user' | 'agency';

/** The slice of an A2UI v1 component this chat renders. */
export interface A2UIComponent {
  id: string;
  component: string;
  children?: string[];
  child?: string;
  text?: string;
  label?: string;
  variant?: string;
  placeholder?: string;
  options?: { label: string; value: string }[];
  value?: { '@path': string };
  href?: string;
  action?: {
    event?: {
      name: string;
      context?: Record<string, { '@path': string }>;
    };
  };
}

export interface AgentPageContext {
  kind: 'customer' | 'lead' | 'deal' | 'listing' | 'calendar' | 'mortgage_case' | 'banker' | 'page';
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
  | {
      type: 'valuation';
      low: number | null;
      high: number | null;
      expected?: number | null;
      asking?: number | null;
      verdict: string;
      city: string;
      street?: string | null;
      parts?: { label: string; factor: number }[];
    }
  | {
      type: 'a2ui';
      surfaceId: string;
      components: A2UIComponent[];
      dataModel: Record<string, string | string[]>;
    }
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
      type: 'mortgage_case';
      id: string;
      href: string;
      title: string;
      stage: string;
      requestedAmount: number | null;
      propertyCity: string | null;
    }
  | {
      type: 'banker_contact';
      id: string;
      href: string;
      name: string;
      bankName: string;
      branch: string | null;
      phone: string | null;
      email: string | null;
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
  /** Set on a card that was just opened from the menu, so its line types in. */
  fresh?: boolean;
}

/** `2024-06-01` becomes `01/06/2024`. Anything that is not a calendar day is left as written. */
/** How many characters to reveal on the next typing frame. Fast, and a long answer does not crawl. */
export function typeStep(remaining: number): number {
  if (remaining > 500) return 8;
  if (remaining > 180) return 5;
  return 3;
}

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

function transcriptKey(agentId: AssistantAgentId): string {
  return `nadlan:assistant:transcript:${agentId}`;
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

/** What is on screen, so a new page in this tab opens on the same chat. */
export function storedTranscript(agentId: AssistantAgentId = 'end-user'): AssistantMessage[] {
  try {
    const raw = window.sessionStorage.getItem(transcriptKey(agentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const message = item as AssistantMessage;
      if (message.role !== 'user' && message.role !== 'assistant') return [];
      if (typeof message.content !== 'string' || !Array.isArray(message.cards)) return [];
      return [{ ...message, fresh: false }];
    });
  } catch {
    return [];
  }
}

export function rememberTranscript(messages: AssistantMessage[], agentId: AssistantAgentId = 'end-user'): void {
  try {
    const saved = messages.map((message) => {
      const next = { ...message };
      delete next.fresh;
      return next;
    });
    window.sessionStorage.setItem(transcriptKey(agentId), JSON.stringify(saved));
  } catch {
    // The chat is still on this page. The next page starts from the server copy.
  }
}

export function forgetTranscript(agentId: AssistantAgentId = 'end-user'): void {
  try {
    window.sessionStorage.removeItem(transcriptKey(agentId));
  } catch {
    // The panel already cleared what it is showing.
  }
}

/**
 * A page that just opened already has the chat, or it does not.
 *
 * The copy kept in this tab wins: it includes a form opened from the menu, which
 * the server never stored. The server copy is only the start, when this tab has none.
 */
export function shownTranscript(current: AssistantMessage[], loaded: AssistantMessage[]): AssistantMessage[] {
  return current.length > 0 ? current : loaded;
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
): Promise<{ ok: true; messages: AssistantMessage[] } | { ok: false; missing: boolean }> {
  try {
    const response = await fetch(`${apiBaseUrl}/agents/${agentId}/conversations/${id}`, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (response.status === 404) return { ok: false, missing: true };
    if (!response.ok) return { ok: false, missing: false };
    const body = (await response.json()) as { messages?: AssistantMessage[] };
    return { ok: true, messages: body.messages ?? [] };
  } catch {
    return { ok: false, missing: false };
  }
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
