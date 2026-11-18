import type { Principal } from '../../auth/types/principal.js';
import type { LlmPreset } from '../../llm/llm.types.js';

/** Which assistant a tool is willing to serve. A tool may serve more than one. */
export type AgentAudience = 'end-user' | 'agency' | 'broker';

/**
 * Who may open a chat.
 *
 * `agency-member` is the CRM assistant: signed in, with an approved agency. It cannot
 * be relaxed to anonymous or signed-in by the environment.
 */
export type AgentAccess = 'anonymous' | 'signed-in' | 'agency-member';

/**
 * What CRM screen the person is looking at. Sent with each turn so "הלקוח" means
 * the open one, not a guess.
 */
export interface AgentPageContext {
  kind: 'customer' | 'lead' | 'deal' | 'listing' | 'calendar' | 'mortgage_case' | 'banker' | 'page';
  id?: string;
  path: string;
}

/** Who is talking. Tools that need an account read `principal`; the rest must not. */
export interface AgentContext {
  agentId: string;
  principal: Principal | null;
  visitorId: string | null;
  /**
   * The agency this chat belongs to. Set for the CRM assistant so a person who moves
   * offices does not reopen a transcript that named the previous office's customers.
   */
  agencyId?: string | null;
  /** The open CRM screen, when the chat is mounted inside the agency shell. */
  page?: AgentPageContext | null;
  /**
   * Cards already drawn in the last few messages, including earlier tools in this
   * turn. A tool uses them to avoid sending the same link again.
   */
  recentCards?: AgentCard[];
  /** The tool call id being invoked right now — used to stamp confirm cards. */
  pendingToolCallId?: string;
  /** When set, a confirm-gated tool with this id may run instead of waiting. */
  confirmedToolCallId?: string;
  /** Everything the person has written in this chat. Tools use it so they do not invent. */
  said?: string;
  /** The message that opened this turn. */
  latestUserMessage?: string;
  /** The details question was already shown, so a later tool call prices with what was said. */
  detailsAnswered?: boolean;
}

/**
 * What the browser draws under a reply. The model never sees this — it sees `summary`.
 * Keeping the two apart is what stops a card of five listings from being re-sent, in
 * full, on every later turn.
 */
export type AgentCard =
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
  | { type: 'link'; href: string; label: string }
  | {
      type: 'price-history';
      city: string;
      street: string;
      radiusMetres: number;
      /** Set when the question was about one size, for example 4 rooms. */
      rooms?: number | null;
      /** Newest year first. `median` and `perSqm` are shekels. */
      years: { year: number; count: number; median: number; perSqm: number | null }[];
      /** Newest sale first. `date` is `YYYY-MM-DD`. */
      recent: { date: string; amount: number; rooms: number | null; area: number | null; perSqm: number | null }[];
      /** Median asking price of listings on the street that are published now. */
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
      /** Short Hebrew sentence of what will happen, for the button strip. */
      label: string;
      /** One-line detail without phones or emails. */
      detail: string;
      status: 'pending' | 'done' | 'cancelled';
    };

/** Args held until the person presses אשר on a confirm card. */
export interface PendingConfirm {
  toolName: string;
  args: unknown;
  label: string;
  detail: string;
}

/** What a tool hands back. `summary` is for the model, `cards` are for the screen. */
export interface ToolResult {
  summary: string;
  cards?: AgentCard[];
  needsSignIn?: boolean;
  /** The write is ready but not run — the browser must show אשר / בטל. */
  needsConfirm?: boolean;
  pendingConfirm?: PendingConfirm;
  /**
   * Spoken to the person as-is, and the turn stops. The model does not get another
   * chance to answer past it.
   */
  reply?: string;
}

export interface AgentBudget {
  /** Model calls in one user message, including the rounds spent on tools. */
  maxRounds: number;
  /** User turns kept verbatim. Older ones collapse into the summary. */
  historyTurns: number;
  /** Refuse another turn once a conversation has cost this many tokens. */
  conversationTokens: number;
  /**
   * The tool schemas sent with every call. Past this, the agent is misconfigured:
   * startup fails rather than quietly spending the budget on parameter descriptions.
   */
  toolSchemaTokens: number;
  /**
   * Above this many tools the model is shown group names first and the schemas of a
   * group only after it asks. Below it, every schema is sent — there aren't enough
   * to be worth a round trip.
   */
  groupThreshold: number;
}

export interface AgentDefinition {
  id: string;
  audience: AgentAudience;
  /** Used when the environment does not say otherwise. */
  access: AgentAccess;
  preset: LlmPreset;
  systemPrompt: () => string;
  /** When set, only these tool names. Otherwise every tool tagged for `audience`. */
  allow?: string[];
  deny?: string[];
  budget: AgentBudget;
}

export interface StoredToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** A row as the runtime keeps it. The database shape is the store's concern. */
export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string | null;
  toolCallId?: string | null;
  toolCalls?: StoredToolCall[];
  cards?: AgentCard[];
  needsSignIn?: boolean;
  pendingConfirm?: PendingConfirm;
}

export interface Transcript {
  id: string;
  agentId: string;
  userId: string | null;
  visitorId: string | null;
  summary: string;
  summaryCovers: number;
  tokensUsed: number;
  messages: TranscriptMessage[];
}
