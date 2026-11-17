import { Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AdminModule } from '../../admin/admin.module.js';
import { TenantScope } from '../../tenancy/tenant-scope.js';
import { AgentExclude, isAgentExcluded } from './agent-exclude.js';
import { AgentTool } from './agent-tool.decorator.js';
import type { ToolResult } from './agent.types.js';
import { ToolDiscoveryService } from './tool-discovery.service.js';
import { ToolRegistry } from './tool-registry.js';

@Injectable()
class HiddenTools {
  @AgentTool({ name: 'secret', description: 'סוד', audiences: ['end-user'] })
  secret(): ToolResult {
    return { summary: 'לא' };
  }
}

@AgentExclude()
@Module({ providers: [HiddenTools] })
class HiddenModule {}

@Injectable()
class ShownTools {
  @AgentTool({ name: 'ping', description: 'בדיקה', audiences: ['end-user'] })
  ping(): ToolResult {
    return { summary: 'pong' };
  }
}

@Module({ providers: [ShownTools] })
class ShownModule {}

@Injectable()
class BadAgencyTools {
  @AgentTool({
    name: 'leak',
    description: 'לא אמור להירשם',
    audiences: ['end-user', 'agency'],
    scope: 'agency',
  })
  leak(): ToolResult {
    return { summary: 'לא' };
  }
}

@Module({ providers: [BadAgencyTools] })
class BadAgencyModule {}

@Injectable()
class AgencyOnlyNoScope {
  @AgentTool({
    name: 'orphan',
    description: 'חסר scope',
    audiences: ['agency'],
  })
  orphan(): ToolResult {
    return { summary: 'לא' };
  }
}

@Module({ providers: [AgencyOnlyNoScope] })
class AgencyOnlyNoScopeModule {}

const config = (excludedModules: string[]) => ({
  provide: ConfigService,
  useValue: { getOrThrow: () => ({ excludedModules, byAgent: {} }) },
});

const tenantScope = {
  provide: TenantScope,
  useValue: { run: async (_principal: unknown, work: () => Promise<unknown>) => work() },
};

describe('tool discovery', () => {
  it('keeps an excluded module out of the registry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule, HiddenModule, ShownModule],
      providers: [ToolRegistry, ToolDiscoveryService, config([]), tenantScope],
    }).compile();

    await moduleRef.init();

    expect(moduleRef.get(ToolRegistry).all().map((tool) => tool.name)).toEqual(['ping']);
  });

  it('also skips a module named in the environment', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule, ShownModule],
      providers: [ToolRegistry, ToolDiscoveryService, config(['ShownModule']), tenantScope],
    }).compile();

    await moduleRef.init();

    expect(moduleRef.get(ToolRegistry).all()).toEqual([]);
  });

  it('does not let the admin module contribute a tool', () => {
    expect(isAgentExcluded(AdminModule)).toBe(true);
  });

  it('refuses an agency-scoped tool that is also tagged for end-user', async () => {
    const moduleRef = Test.createTestingModule({
      imports: [DiscoveryModule, BadAgencyModule],
      providers: [ToolRegistry, ToolDiscoveryService, config([]), tenantScope],
    });

    await expect(moduleRef.compile().then((ref) => ref.init())).rejects.toThrow(/scope:agency/);
  });

  it('refuses an agency-only tool without scope', async () => {
    const moduleRef = Test.createTestingModule({
      imports: [DiscoveryModule, AgencyOnlyNoScopeModule],
      providers: [ToolRegistry, ToolDiscoveryService, config([]), tenantScope],
    });

    await expect(moduleRef.compile().then((ref) => ref.init())).rejects.toThrow(/scope: 'agency'/);
  });
});
