import type { Principal } from '../../auth/types/principal.js';
import type { LlmPreset } from '../../llm/llm.types.js';

/** Which assistant a tool is willing to serve. A tool may serve more than one. */
export type AgentAudience = 'end-user' | 'agency' | 'broker';

export type AgentAccess = 'anonymous' | 'signed-in';

/** Who is talking. Tools that need an account read `principal`; the rest must not. */
export interface AgentContext {
  agentId: string;
  principal: Principal | null;
  visitorId: string | null;
  /**
   * Cards already drawn in the last few messages, including earlier tools in this
   * turn. A tool uses them to avoid sending the same link again.
   */
  recentCards?: AgentCard[];
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
  | { type: 'valuation'; low: number | null; high: number | null; verdict: string; city: string }
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
    };

/** What a tool hands back. `summary` is for the model, `cards` are for the screen. */
export interface ToolResult {
  summary: string;
  cards?: AgentCard[];
  needsSignIn?: boolean;
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
