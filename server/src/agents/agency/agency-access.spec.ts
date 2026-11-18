import { endUserAgent } from '../end-user/end-user.agent.js';
import { agencyAgent } from './agency.agent.js';
import { ToolRegistry, type RegisteredTool } from '../core/tool-registry.js';
import type { AgentContext } from '../core/agent.types.js';

function tool(partial: Partial<RegisteredTool> & Pick<RegisteredTool, 'name' | 'audiences'>): RegisteredTool {
  return {
    description: 'x',
    group: 'general',
    auth: false,
    confirm: false,
    moduleName: 'Test',
    parameters: { type: 'object', properties: {} },
    invoke: async () => ({ summary: 'ok' }),
    ...partial,
  };
}

describe('agency agent separation', () => {
  it('keeps agency-scoped tools off the end-user agent', async () => {
    const registry = new ToolRegistry();
    registry.add(
      tool({
        name: 'find_customers',
        audiences: ['agency'],
        scope: 'agency',
      }),
    );
    registry.add(
      tool({
        name: 'search_listings',
        audiences: ['end-user', 'agency'],
      }),
    );

    expect(registry.forAgent(endUserAgent, []).map((row) => row.name)).toEqual(['search_listings']);
    expect(registry.forAgent(agencyAgent, []).map((row) => row.name).sort()).toEqual([
      'find_customers',
      'search_listings',
    ]);

    const ctx: AgentContext = { agentId: 'end-user', principal: null, visitorId: 'v1' };
    await expect(registry.invoke(endUserAgent, [], 'find_customers', {}, ctx)).resolves.toEqual({
      summary: 'אין כלי בשם find_customers.',
    });
  });

  it('is locked to agency-member access', () => {
    expect(agencyAgent.access).toBe('agency-member');
    expect(agencyAgent.audience).toBe('agency');
  });
});
