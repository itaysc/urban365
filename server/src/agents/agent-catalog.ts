import { Injectable, type OnModuleInit } from '@nestjs/common';
import { agencyAgent } from './agency/agency.agent.js';
import { endUserAgent } from './end-user/end-user.agent.js';
import { agentById, AgentRuntime } from './core/agent-runtime.js';
import type { AgentDefinition } from './core/agent.types.js';
import { ToolDiscoveryService } from './core/tool-discovery.service.js';

/**
 * The assistants this process serves.
 *
 * Depends on discovery so the tools exist before the budget is checked. A schema
 * that no longer fits fails here, at boot, rather than on the first message.
 */
@Injectable()
export class AgentCatalog implements OnModuleInit {
  readonly agents: AgentDefinition[] = [endUserAgent, agencyAgent];

  constructor(
    private readonly runtime: AgentRuntime,
    private readonly discovery: ToolDiscoveryService,
  ) {}

  onModuleInit(): void {
    void this.discovery;
    for (const agent of this.agents) {
      const access = this.runtime.access(agent);
      // The CRM assistant must stay locked to an agency member. An env typo that
      // opened it to visitors would put customer phones one chat away from the public.
      if (agent.access === 'agency-member' && access !== 'agency-member') {
        throw new Error(
          `${agent.id} must stay agency-member; AGENT_${agent.id.toUpperCase().replace(/-/g, '_')}_ACCESS tried to set ${access}.`,
        );
      }
      this.runtime.assertBudget(agent);
    }
  }

  get(id: string): AgentDefinition {
    return agentById(this.agents, id);
  }
}
