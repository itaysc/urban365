import type { Action } from '../../auth/permissions.js';
import type { AgentAudience } from './agent.types.js';

export const AGENT_TOOLS = 'agent:tools';

export type AgentToolScope = 'agency';

export interface AgentToolOptions {
  /** Defaults to the method name. Say it when the method name is not what the model should see. */
  name?: string;
  description: string;
  audiences: AgentAudience[];
  /** Which drawer this sits in, once an agent has enough tools to load them in groups. */
  group?: string;
  /** The caller must be signed in. An anonymous call is answered, not executed. */
  auth?: boolean;
  /**
   * The tool reads or writes one agency's CRM. Discovery refuses a tool that carries
   * this and also lists `end-user`. The call runs inside a short tenant transaction.
   */
  scope?: AgentToolScope;
  /** An `Action` from permissions.ts. Checked before the method runs, and again inside the service. */
  requires?: Action;
  /**
   * The tool changes CRM data. It does not run until the person presses אשר on the
   * card the browser draws. Reads stay immediate.
   */
  confirm?: boolean;
  /** The class-validator class the arguments are checked against, and described by. */
  dto?: new () => object;
  /** Fields of `dto` the model is not told about. The handler still receives them if sent. */
  omit?: string[];
}

export interface StoredAgentTool extends Required<Pick<AgentToolOptions, 'description' | 'audiences'>> {
  name: string;
  method: string;
  group: string;
  auth: boolean;
  scope?: AgentToolScope;
  requires?: Action;
  confirm: boolean;
  dto?: new () => object;
  omit: string[];
}

/**
 * Makes a service method a tool.
 *
 * One decorator is the whole registration: discovery finds it at startup, builds the
 * parameter schema from `dto`, and offers it to every agent whose audience is listed.
 * The method receives the validated dto (when there is one) and the caller.
 */
export function AgentTool(options: AgentToolOptions): MethodDecorator {
  return (target, propertyKey) => {
    const ctor = target.constructor;
    const list = toolsOn(ctor);
    list.push({
      name: options.name ?? String(propertyKey),
      description: options.description,
      audiences: options.audiences,
      method: String(propertyKey),
      group: options.group ?? 'general',
      auth: options.auth ?? false,
      scope: options.scope,
      requires: options.requires,
      confirm: options.confirm ?? false,
      dto: options.dto,
      omit: options.omit ?? [],
    });
    Reflect.defineMetadata(AGENT_TOOLS, list, ctor);
  };
}

export function toolsOn(ctor: object): StoredAgentTool[] {
  return Reflect.getMetadata(AGENT_TOOLS, ctor) ?? [];
}
