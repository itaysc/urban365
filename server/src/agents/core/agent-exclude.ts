import { SetMetadata } from '@nestjs/common';

export const AGENT_EXCLUDE = 'agent:exclude';

/**
 * A Nest module the assistants must not grow tools out of.
 *
 * Put it on the module class. Discovery then skips every provider in it, so an
 * `@AgentTool` added there later — on purpose or by a copy — never reaches a model.
 * The environment can exclude more (`AGENT_EXCLUDED_MODULES`); it cannot include
 * these back in.
 */
export const AgentExclude = () => SetMetadata(AGENT_EXCLUDE, true);

export function isAgentExcluded(mod: abstract new (...args: never[]) => unknown): boolean {
  return Reflect.getMetadata(AGENT_EXCLUDE, mod) === true;
}
