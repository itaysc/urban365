import { Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AdminModule } from '../../admin/admin.module.js';
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

const config = (excludedModules: string[]) => ({
  provide: ConfigService,
  useValue: { getOrThrow: () => ({ excludedModules, byAgent: {} }) },
});

describe('tool discovery', () => {
  it('keeps an excluded module out of the registry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule, HiddenModule, ShownModule],
      providers: [ToolRegistry, ToolDiscoveryService, config([])],
    }).compile();

    await moduleRef.init();

    expect(moduleRef.get(ToolRegistry).all().map((tool) => tool.name)).toEqual(['ping']);
  });

  it('also skips a module named in the environment', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule, ShownModule],
      providers: [ToolRegistry, ToolDiscoveryService, config(['ShownModule'])],
    }).compile();

    await moduleRef.init();

    expect(moduleRef.get(ToolRegistry).all()).toEqual([]);
  });

  it('does not let the admin module contribute a tool', () => {
    expect(isAgentExcluded(AdminModule)).toBe(true);
  });
});
