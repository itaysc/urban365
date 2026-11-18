import { dtoToJsonSchema } from '../core/dto-schema.js';
import { toolsOn } from '../core/agent-tool.decorator.js';
import { estimateTokens } from '../core/tokens.js';
import { toolSchemaTokens, visibleToolSpecs } from '../core/tool-selection.js';
import { agencyAgent } from './agency.agent.js';
import { agencySystemPrompt } from './agency.prompt.js';
import { AgencyToolsService } from './agency.tools.js';
import { AGENCY_EVAL_PROMPTS } from './eval-prompts.js';
import { MortgageCrmToolsService } from './mortgage-crm.tools.js';

describe('agency assistant', () => {
  const tools = [...toolsOn(AgencyToolsService), ...toolsOn(MortgageCrmToolsService)];

  it('registers a description and a schema for every CRM tool', () => {
    expect(tools.length).toBeGreaterThanOrEqual(20);
    for (const tool of tools) {
      expect(tool.description.trim().length).toBeGreaterThan(0);
      expect(tool.scope).toBe('agency');
      expect(tool.audiences).toContain('agency');
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
      agencyAgent.budget.groupThreshold,
    );

    expect(toolSchemaTokens(specs)).toBeLessThanOrEqual(agencyAgent.budget.toolSchemaTokens);
  });

  it('keeps the system prompt short', () => {
    const prompt = agencySystemPrompt();
    expect(estimateTokens(prompt)).toBeLessThan(800);
    expect(prompt).toContain('Urban365');
  });

  it('points every evaluation prompt at a tool that exists', () => {
    const names = new Set(tools.map((tool) => tool.name));
    expect(AGENCY_EVAL_PROMPTS.length).toBeGreaterThanOrEqual(20);
    for (const item of AGENCY_EVAL_PROMPTS) expect(names.has(item.tool)).toBe(true);
  });
});
