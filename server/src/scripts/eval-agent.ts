import 'dotenv/config';
import OpenAI from 'openai';
import { END_USER_AGENT_LLM } from '../llm/llm.defaults.js';
import { toolsOn } from '../agents/core/agent-tool.decorator.js';
import { dtoToJsonSchema } from '../agents/core/dto-schema.js';
import { endUserSystemPrompt } from '../agents/end-user/end-user.prompt.js';
import { EndUserToolsService } from '../agents/end-user/end-user.tools.js';
import { EVAL_PROMPTS } from '../agents/end-user/eval-prompts.js';

/**
 * Asks the model which tool it would call, and checks it is the one we expect.
 *
 * Without `--live` it only checks the list is well formed. With `--live` it spends
 * tokens: one short call per prompt, tools and no follow-up.
 *
 *   node dist/scripts/eval-agent.js --live
 */
const live = process.argv.includes('--live');
const tools = toolsOn(EndUserToolsService);
const known = new Set(tools.map((tool) => tool.name));
const missing = EVAL_PROMPTS.filter((item) => !known.has(item.tool));

if (missing.length > 0) {
  console.error(missing.map((item) => `${item.tool} is not a tool`).join('\n'));
  process.exit(1);
}

console.log(`${EVAL_PROMPTS.length} prompts, ${known.size} tools.`);
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

for (const item of EVAL_PROMPTS) {
  const response = await client.chat.completions.create({
    model: END_USER_AGENT_LLM.model,
    temperature: 0,
    max_tokens: 80,
    messages: [
      { role: 'system', content: endUserSystemPrompt() },
      { role: 'user', content: item.prompt },
    ],
    tools: specs,
    tool_choice: 'auto',
  });
  const name = response.choices[0]?.message.tool_calls?.find((call) => call.type === 'function')?.function.name;
  const ok = name === item.tool;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok ' : 'NO '} ${item.tool.padEnd(22)} got ${name ?? 'no tool'}  ${item.prompt}`);
}

if (failed > 0) process.exit(1);
