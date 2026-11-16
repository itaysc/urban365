import { dtoToJsonSchema } from '../core/dto-schema.js';
import { toolsOn } from '../core/agent-tool.decorator.js';
import { estimateTokens } from '../core/tokens.js';
import { toolSchemaTokens, visibleToolSpecs } from '../core/tool-selection.js';
import { endUserAgent } from './end-user.agent.js';
import { EVAL_PROMPTS } from './eval-prompts.js';
import { endUserSystemPrompt } from './end-user.prompt.js';
import { EndUserToolsService } from './end-user.tools.js';

describe('end-user assistant', () => {
  const tools = toolsOn(EndUserToolsService);

  it('registers a description and a schema for every tool', () => {
    expect(tools.length).toBeGreaterThanOrEqual(13);
    for (const tool of tools) {
      expect(tool.description.trim().length).toBeGreaterThan(0);
      if (tool.dto) expect(() => dtoToJsonSchema(tool.dto!, tool.omit)).not.toThrow();
    }
  });

  it('keeps the tool schemas inside the budget', () => {
    const specs = visibleToolSpecs(
      tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        group: tool.group,
        parameters: tool.dto ? dtoToJsonSchema(tool.dto, tool.omit) : { type: 'object' as const, properties: {} },
      })),
      [],
      endUserAgent.budget.groupThreshold,
    );

    expect(toolSchemaTokens(specs)).toBeLessThanOrEqual(endUserAgent.budget.toolSchemaTokens);
  });

  it('keeps the system prompt to the index, not the articles', () => {
    const prompt = endUserSystemPrompt();
    expect(estimateTokens(prompt)).toBeLessThan(1_200);
    expect(prompt).not.toContain('החיפוש מתחיל במקום');
  });

  it('points every evaluation prompt at a tool that exists', () => {
    const names = new Set(tools.map((tool) => tool.name));
    expect(EVAL_PROMPTS.length).toBeGreaterThanOrEqual(20);
    for (const item of EVAL_PROMPTS) expect(names.has(item.tool)).toBe(true);
  });
});
