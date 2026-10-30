/** Provider API model identifiers — use these instead of inline strings. */
export const LLMModels = {
  OPENAI_GPT_4O_MINI: 'gpt-4o-mini',
  OPENAI_GPT_4O: 'gpt-4o',
} as const;

export type LLMModelId = (typeof LLMModels)[keyof typeof LLMModels];
