import { END_USER_AGENT_LLM } from '../../llm/llm.defaults.js';
import type { AgentDefinition } from '../core/agent.types.js';
import { agencySystemPrompt } from './agency.prompt.js';

/**
 * The assistant for someone working the CRM: customers, leads, deals, the diary.
 *
 * Discovery finds its tools from `@AgentTool` methods tagged `agency` with
 * `scope: 'agency'`. Public market tools are shared by audience, without that scope.
 */
export const agencyAgent: AgentDefinition = {
  id: 'agency',
  audience: 'agency',
  access: 'agency-member',
  preset: END_USER_AGENT_LLM,
  systemPrompt: agencySystemPrompt,
  budget: {
    maxRounds: 5,
    historyTurns: 8,
    conversationTokens: 80_000,
    toolSchemaTokens: 8_000,
    // Enough CRM tools that the model should pick a group first.
    groupThreshold: 12,
  },
};
