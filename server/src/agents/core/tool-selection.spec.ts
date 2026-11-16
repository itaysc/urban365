import { toolSchemaTokens, visibleToolSpecs, type SelectableTool } from './tool-selection.js';

const tool = (name: string, group: string): SelectableTool => ({
  name,
  description: name,
  group,
  parameters: { type: 'object', properties: {} },
});

describe('visibleToolSpecs', () => {
  const tools = [tool('search_listings', 'search'), tool('area_prices', 'pricing'), tool('mortgage_plan', 'mortgage')];

  it('sends every tool while there are few of them', () => {
    expect(visibleToolSpecs(tools, [], 20).map((spec) => spec.name)).toEqual([
      'search_listings',
      'area_prices',
      'mortgage_plan',
    ]);
  });

  it('sends group names first, and schemas only after a group is asked for', () => {
    expect(visibleToolSpecs(tools, [], 1).map((spec) => spec.name)).toEqual(['enable_groups']);

    const enabled = visibleToolSpecs(tools, ['pricing'], 1).map((spec) => spec.name);
    expect(enabled).toEqual(['enable_groups', 'area_prices']);
  });

  it('counts the schemas toward a budget', () => {
    expect(toolSchemaTokens(visibleToolSpecs(tools, [], 20))).toBeGreaterThan(0);
  });
});
