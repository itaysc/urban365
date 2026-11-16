import type { LLMToolSpec } from '../../llm/llm.types.js';
import type { JsonSchema } from './dto-schema.js';
import { estimateTokens } from './tokens.js';

export interface SelectableTool {
  name: string;
  description: string;
  group: string;
  parameters: JsonSchema;
}

export const ENABLE_GROUPS = 'enable_groups';

/**
 * The tools a turn actually sends.
 *
 * Under the threshold, all of them: a round trip to discover tools the model was
 * going to need anyway costs more than sending them. Over it, only the groups it
 * has already asked for, plus the one tool that asks.
 */
export function visibleToolSpecs(
  tools: SelectableTool[],
  enabledGroups: readonly string[],
  threshold: number,
): LLMToolSpec[] {
  if (tools.length <= threshold) return tools.map(toSpec);

  const enabled = new Set(enabledGroups);
  const chosen = tools.filter((tool) => enabled.has(tool.group)).map(toSpec);
  const groups = [...new Set(tools.map((tool) => tool.group))];

  return [
    {
      name: ENABLE_GROUPS,
      description:
        'בקש את פירוט הכלים של קבוצה לפני שמשתמשים בה. הקבוצות: ' +
        groups.map((group) => `${group} (${tools.filter((tool) => tool.group === group).length})`).join(', '),
      parameters: {
        type: 'object',
        properties: { groups: { type: 'array', items: { type: 'string', enum: groups } } },
        required: ['groups'],
        additionalProperties: false,
      },
    },
    ...chosen,
  ];
}

export function toolSchemaTokens(specs: LLMToolSpec[]): number {
  return estimateTokens(specs.map((spec) => `${spec.name} ${spec.description} ${JSON.stringify(spec.parameters)}`).join('\n'));
}

function toSpec(tool: SelectableTool): LLMToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as unknown as Record<string, unknown>,
  };
}
