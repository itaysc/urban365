import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService } from '@nestjs/core';
import type { AgentsConfig } from '../../config/configuration.js';
import { isAgentExcluded } from './agent-exclude.js';
import { toolsOn } from './agent-tool.decorator.js';
import type { AgentContext, ToolResult } from './agent.types.js';
import { dtoToJsonSchema } from './dto-schema.js';
import { readDto, ToolRegistry } from './tool-registry.js';

interface HostModule {
  metatype?: abstract new (...args: never[]) => unknown;
}

/**
 * Collects every `@AgentTool` in the process, once, at startup.
 *
 * A feature module does not import this one and does not list its tools anywhere.
 * The decorator is the registration. A module marked `@AgentExclude()`, or named in
 * `AGENT_EXCLUDED_MODULES`, is skipped here — the tool is absent, not merely unmentioned,
 * so a model cannot call it by guessing the name.
 */
@Injectable()
export class ToolDiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(ToolDiscoveryService.name);
  private readonly skipped = new Set<string>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly registry: ToolRegistry,
    config: ConfigService,
  ) {
    this.excluded = new Set(config.getOrThrow<AgentsConfig>('agents').excludedModules);
  }

  private readonly excluded: Set<string>;

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | null;
      if (!instance || typeof instance !== 'object') continue;

      const ctor = instance.constructor as abstract new (...args: never[]) => unknown;
      const found = toolsOn(ctor);
      if (found.length === 0) continue;

      const moduleName = moduleOf(wrapper as { host?: HostModule });
      if (this.excluded.has(moduleName) || excludedHost(wrapper as { host?: HostModule })) {
        this.skipped.add(moduleName);
        continue;
      }

      for (const tool of found) {
        if (!tool.description.trim()) {
          throw new Error(`${moduleName}.${tool.method} is an @AgentTool with no description.`);
        }

        const parameters = tool.dto ? dtoToJsonSchema(tool.dto, tool.omit) : { type: 'object' as const, properties: {} };
        const method = instance[tool.method];
        if (typeof method !== 'function') {
          throw new Error(`${moduleName}.${tool.method} is decorated but not a function.`);
        }
        const call = method.bind(instance) as (dto: object | undefined, ctx: AgentContext) => Promise<unknown>;

        this.registry.add({
          name: tool.name,
          description: tool.description,
          audiences: tool.audiences,
          group: tool.group,
          auth: tool.auth,
          moduleName,
          parameters,
          invoke: (args, ctx) => invokeTool(call, tool.dto, tool.auth, args, ctx),
        });
      }
    }

    const names = this.registry.all().map((tool) => tool.name);
    this.logger.log(
      `Registered ${names.length} tool(s)${names.length ? `: ${names.join(', ')}` : ''}` +
        (this.skipped.size ? `. Skipped modules: ${[...this.skipped].join(', ')}` : ''),
    );
  }
}

function moduleOf(wrapper: { host?: HostModule }): string {
  return wrapper.host?.metatype?.name ?? 'UnknownModule';
}

function excludedHost(wrapper: { host?: HostModule }): boolean {
  const metatype = wrapper.host?.metatype;
  return metatype ? isAgentExcluded(metatype) : false;
}

async function invokeTool(
  call: (dto: object | undefined, ctx: AgentContext) => Promise<unknown>,
  dto: (new () => object) | undefined,
  auth: boolean,
  args: unknown,
  ctx: AgentContext,
): Promise<ToolResult> {
  if (auth && !ctx.principal) {
    return {
      summary: 'המשתמש לא מחובר. בקש ממנו להתחבר כדי להמשיך, ואל תטען שהפעולה בוצעה.',
      needsSignIn: true,
    };
  }

  let value: object | undefined;
  if (dto) {
    const read = readDto(dto, args);
    if ('error' in read) return { summary: read.error };
    value = read.value;
  }

  try {
    return asResult(await call(value, ctx));
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'הפעולה נכשלה.';
    return { summary: message };
  }
}

function asResult(value: unknown): ToolResult {
  if (isToolResult(value)) {
    return { ...value, summary: value.summary.slice(0, 1500) };
  }
  return { summary: JSON.stringify(value).slice(0, 1500) };
}

function isToolResult(value: unknown): value is ToolResult {
  if (typeof value !== 'object' || value === null || !('summary' in value)) return false;
  return typeof value.summary === 'string';
}
