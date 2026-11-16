import { END_USER_AGENT_LLM } from '../../llm/llm.defaults.js';
import type { AgentDefinition } from '../core/agent.types.js';
import { endUserSystemPrompt } from './end-user.prompt.js';

/**
 * The assistant for someone using the site: search, prices, a mortgage, a draft listing.
 *
 * It does not name its tools. Discovery does, from `@AgentTool` methods tagged
 * `end-user`. `deny` is the escape hatch for one tool that should not be offered
 * even though it carries the tag.
 */
export const endUserAgent: AgentDefinition = {
  id: 'end-user',
  audience: 'end-user',
  access: 'anonymous',
  preset: END_USER_AGENT_LLM,
  systemPrompt: endUserSystemPrompt,
  budget: {
    maxRounds: 4,
    historyTurns: 8,
    conversationTokens: 80_000,
    toolSchemaTokens: 6_000,
    groupThreshold: 20,
  },
};
