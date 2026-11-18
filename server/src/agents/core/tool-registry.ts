import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import type { Action } from '../../auth/permissions.js';
import type { AgentAudience, AgentContext, AgentDefinition, ToolResult } from './agent.types.js';
import type { AgentToolScope } from './agent-tool.decorator.js';
import type { JsonSchema } from './dto-schema.js';

export interface RegisteredTool {
  name: string;
  description: string;
  audiences: AgentAudience[];
  group: string;
  auth: boolean;
  scope?: AgentToolScope;
  requires?: Action;
  confirm: boolean;
  moduleName: string;
  parameters: JsonSchema;
  invoke(args: unknown, ctx: AgentContext): Promise<ToolResult>;
}

/**
 * Every tool any agent might call.
 *
 * Registration is discovery's job. Selecting which of them a given agent sees is
 * `forAgent`: audience first, then the agent's own allow and deny lists, then the
 * modules that agent was told to ignore.
 */
@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  add(tool: RegisteredTool): void {
    const existing = this.tools.get(tool.name);
    if (existing) {
      throw new Error(`Two tools are named ${tool.name} (${existing.moduleName} and ${tool.moduleName}).`);
    }
    this.tools.set(tool.name, tool);
  }

  all(): RegisteredTool[] {
    return [...this.tools.values()];
  }

  forAgent(agent: AgentDefinition, excludedModules: readonly string[]): RegisteredTool[] {
    const excluded = new Set(excludedModules);
    const allow = agent.allow ? new Set(agent.allow) : null;
    const deny = new Set(agent.deny ?? []);

    return this.all().filter((tool) => {
      if (!tool.audiences.includes(agent.audience)) return false;
      if (excluded.has(tool.moduleName)) return false;
      if (allow && !allow.has(tool.name)) return false;
      if (deny.has(tool.name)) return false;
      return true;
    });
  }

  /**
   * Runs one call for one agent.
   *
   * A name the agent was not given is refused even if some other agent has it: the
   * model only knows the names it was shown, and guessing past that list must not work.
   */
  async invoke(
    agent: AgentDefinition,
    excludedModules: readonly string[],
    name: string,
    args: unknown,
    ctx: AgentContext,
  ): Promise<ToolResult> {
    const tool = this.forAgent(agent, excludedModules).find((candidate) => candidate.name === name);
    if (!tool) return { summary: `אין כלי בשם ${name}.` };
    return tool.invoke(args, ctx);
  }
}

export function formatErrors(errors: ValidationError[], prefix = ''): string {
  return errors
    .flatMap((error) => {
      const path = prefix ? `${prefix}.${error.property}` : error.property;
      const own = error.constraints ? [`${path}: ${Object.values(error.constraints).join(', ')}`] : [];
      const children = error.children?.length ? [formatErrors(error.children, path)] : [];
      return [...own, ...children];
    })
    .filter(Boolean)
    .join('; ');
}

/** Validates `args` against a DTO. Returns the instance, or a summary the model can correct from. */
export function readDto<T extends object>(dto: new () => T, args: unknown): { value: T } | { error: string } {
  const value = plainToInstance(dto, args ?? {}, { enableImplicitConversion: true });
  const errors = validateSync(value, { whitelist: true });
  if (errors.length > 0) return { error: `ארגומנטים לא תקינים: ${formatErrors(errors)}` };
  return { value };
}
