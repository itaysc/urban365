import { Injectable, type OnModuleInit } from '@nestjs/common';
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
  readonly agents: AgentDefinition[] = [endUserAgent];

  constructor(
    private readonly runtime: AgentRuntime,
    private readonly discovery: ToolDiscoveryService,
  ) {}

  onModuleInit(): void {
    void this.discovery;
    for (const agent of this.agents) this.runtime.assertBudget(agent);
  }

  get(id: string): AgentDefinition {
    return agentById(this.agents, id);
  }
}
