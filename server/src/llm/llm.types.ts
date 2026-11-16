import type { LLMModelId } from './llm.models.js';

export enum LLMIntegration {
  OPENAI = 'openai',
}

export type LLMResponseFormat = 'text' | 'json';

/** Task preset: integration + model + generation limits (see `llm.defaults.ts`). */
export interface LlmPreset {
  integration: LLMIntegration;
  model: LLMModelId;
  maxTokens: number;
  temperature: number;
  responseFormat?: LLMResponseFormat;
}

export interface LLMAskParams {
  prompt: string;
  systemMsg?: string;
  integration?: LLMIntegration;
  model?: LLMModelId;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  responseFormat?: LLMResponseFormat;
}

/** One turn of a tool-calling conversation. A `tool` message carries the matching call id. */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: LLMToolCall[];
  toolCallId?: string;
}

export interface LLMToolCall {
  id: string;
  name: string;
  /** JSON, as the model sent it. Parsed by the caller. */
  arguments: string;
}

/** A function the model may call. `parameters` is a JSON schema. */
export interface LLMToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMChatParams {
  messages: LLMMessage[];
  tools?: LLMToolSpec[];
  toolChoice?: 'auto' | 'none';
  integration?: LLMIntegration;
  model?: LLMModelId;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMChatResponse {
  content: string | null;
  toolCalls: LLMToolCall[];
  model: string;
  usage: LLMUsage;
  provider: LLMIntegration;
}

/** Text arrives as it is produced. Tool calls arrive whole, with the closing event. */
export type LLMStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; content: string | null; toolCalls: LLMToolCall[]; model: string; usage: LLMUsage };

export interface LLMResponse {
  data: string | null;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: LLMIntegration;
}

/**
 * What every provider has to offer. One method, because the thing a caller wants is
 * always the same — a question in, text out — and a second provider should be a file
 * rather than a change at every call site.
 */
export interface LLMIntegrationInterface {
  ask(params: LLMAskParams): Promise<LLMResponse>;
  chat(params: LLMChatParams): Promise<LLMChatResponse>;
  chatStream(params: LLMChatParams): AsyncGenerator<LLMStreamEvent>;
  getIntegration(): LLMIntegration;
}
