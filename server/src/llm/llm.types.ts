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
  getIntegration(): LLMIntegration;
}
