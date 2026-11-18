import 'dotenv/config';
import OpenAI from 'openai';
import { agencySystemPrompt } from '../agents/agency/agency.prompt.js';
import { AgencyToolsService } from '../agents/agency/agency.tools.js';
import { AGENCY_EVAL_PROMPTS } from '../agents/agency/eval-prompts.js';
import { MortgageCrmToolsService } from '../agents/agency/mortgage-crm.tools.js';
import { toolsOn, type StoredAgentTool } from '../agents/core/agent-tool.decorator.js';
import { dtoToJsonSchema } from '../agents/core/dto-schema.js';
import { endUserSystemPrompt } from '../agents/end-user/end-user.prompt.js';
import { EndUserToolsService } from '../agents/end-user/end-user.tools.js';
import { EVAL_PROMPTS } from '../agents/end-user/eval-prompts.js';
import { END_USER_AGENT_LLM } from '../llm/llm.defaults.js';

/**
 * Asks the model which tool it would call, and checks it is the one we expect.
 *
 * Without `--live` it only checks the list is well formed. With `--live` it spends
 * tokens: one short call per prompt, tools and no follow-up.
 *
 *   node dist/scripts/eval-agent.js --live
 *   node dist/scripts/eval-agent.js --agency --live
 */
const live = process.argv.includes('--live');
const agency = process.argv.includes('--agency');

const tools: StoredAgentTool[] = agency
  ? [...toolsOn(AgencyToolsService), ...toolsOn(MortgageCrmToolsService)]
  : toolsOn(EndUserToolsService);
const prompts = agency ? AGENCY_EVAL_PROMPTS : EVAL_PROMPTS;
const systemPrompt = agency ? agencySystemPrompt() : endUserSystemPrompt();
const known = new Set(tools.map((tool) => tool.name));
const missing = prompts.filter((item) => !known.has(item.tool));

if (missing.length > 0) {
  console.error(missing.map((item) => `${item.tool} is not a tool`).join('\n'));
  process.exit(1);
}

console.log(`${agency ? 'agency' : 'end-user'}: ${prompts.length} prompts, ${known.size} tools.`);
if (!live) {
  console.log('Pass --live to ask the model.');
  process.exit(0);
}

const key = process.env.OPENAI_API_KEY ?? '';
if (!key) {
  console.error('OPENAI_API_KEY is not set.');
  process.exit(1);
}

const specs = tools.map((tool) => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: (tool.dto
      ? dtoToJsonSchema(tool.dto, tool.omit)
      : { type: 'object', properties: {} }) as unknown as Record<string, unknown>,
  },
}));

const client = new OpenAI({ apiKey: key });
let failed = 0;

for (const item of prompts) {
  const response = await client.chat.completions.create({
    model: END_USER_AGENT_LLM.model,
    temperature: 0,
    max_tokens: 80,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: item.prompt },
    ],
    tools: specs,
    tool_choice: 'auto',
  });
  const name = response.choices[0]?.message.tool_calls?.find((call) => call.type === 'function')?.function.name;
  const ok = name === item.tool;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok ' : 'NO '} ${item.tool.padEnd(28)} got ${name ?? 'no tool'}  ${item.prompt}`);
}

if (failed > 0) process.exit(1);
