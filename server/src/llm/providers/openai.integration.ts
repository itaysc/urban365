import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LLMModels } from '../llm.models.js';
import {
  LLMIntegration,
  type LLMAskParams,
  type LLMIntegrationInterface,
  type LLMResponse,
} from '../llm.types.js';

const DEFAULTS = {
  model: LLMModels.OPENAI_GPT_4O_MINI,
  maxTokens: 300,
  temperature: 0.2,
  topP: 1,
};

/** How long a single call may take. A listing must not wait on a hung socket. */
const TIMEOUT_MS = 20_000;

export class OpenAIIntegration implements LLMIntegrationInterface {
  private readonly logger = new Logger(OpenAIIntegration.name);
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    if (!apiKey.trim()) throw new Error('OPENAI_API_KEY is not configured');
    this.client = new OpenAI({
      apiKey,
      // Anything that speaks the same API: a gateway in front of it, or a stub.
      ...(baseURL?.trim() ? { baseURL: baseURL.trim() } : {}),
      timeout: TIMEOUT_MS,
      maxRetries: 1,
    });
  }

  getIntegration(): LLMIntegration {
    return LLMIntegration.OPENAI;
  }

  async ask(params: LLMAskParams): Promise<LLMResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (params.systemMsg) messages.push({ role: 'system', content: params.systemMsg });
    messages.push({ role: 'user', content: params.prompt });

    const response = await this.client.chat.completions.create({
      model: params.model ?? DEFAULTS.model,
      messages,
      max_tokens: params.maxTokens ?? DEFAULTS.maxTokens,
      temperature: params.temperature ?? DEFAULTS.temperature,
      top_p: params.topP ?? DEFAULTS.topP,
      stop: params.stop,
      ...(params.responseFormat === 'json'
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    });

    const choice = response.choices[0];

    // A reply cut off at the token ceiling is not a short answer, it is half an answer —
    // and for JSON it is unparseable. Worth saying out loud rather than failing later.
    if (choice?.finish_reason === 'length') {
      this.logger.warn(`Reply hit the ${params.maxTokens ?? DEFAULTS.maxTokens} token ceiling.`);
    }

    return {
      data: choice?.message?.content?.trim() ?? null,
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      provider: LLMIntegration.OPENAI,
    };
  }
}
