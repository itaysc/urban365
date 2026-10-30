import { LLMModels } from './llm.models.js';
import { LLMIntegration, type LlmPreset } from './llm.types.js';

const GPT_4O_MINI = {
  integration: LLMIntegration.OPENAI,
  model: LLMModels.OPENAI_GPT_4O_MINI,
} satisfies Pick<LlmPreset, 'integration' | 'model'>;

/**
 * Presets rather than numbers at the call site.
 *
 * A temperature and a token ceiling are part of what a task *is* — a moderation verdict
 * wants the same answer every time and fits in a sentence, which is a different thing
 * from writing a description. Naming them here keeps that decision in one place and out
 * of the business logic.
 */

/** General-purpose chat. The starting point for anything new. */
export const GENERAL_LLM = {
  ...GPT_4O_MINI,
  maxTokens: 800,
  temperature: 0.2,
} satisfies LlmPreset;

/** Is this listing a real property for sale, or spam? Short, cold, JSON. */
export const LISTING_MODERATION_LLM = {
  ...GPT_4O_MINI,
  maxTokens: 300,
  temperature: 0,
  responseFormat: 'json',
} satisfies LlmPreset;
