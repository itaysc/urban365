import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LLMModels } from '../llm.models.js';
import {
  LLMIntegration,
  type LLMAskParams,
  type LLMChatParams,
  type LLMChatResponse,
  type LLMIntegrationInterface,
  type LLMMessage,
  type LLMResponse,
  type LLMStreamEvent,
  type LLMToolCall,
  type LLMUsage,
} from '../llm.types.js';

const DEFAULTS = {
  model: LLMModels.OPENAI_GPT_4O_MINI,
  maxTokens: 300,
  temperature: 0.2,
  topP: 1,
};

/** How long a single call may take. A listing must not wait on a hung socket. */
const TIMEOUT_MS = 20_000;

/**
 * A conversation is several calls, and a tool round waits on the previous one.
 * Longer than a moderation verdict, still bounded: a hung socket must not hold the request.
 */
const CHAT_TIMEOUT_MS = 45_000;

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

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const response = await this.client.chat.completions.create(this.body(params), {
      timeout: CHAT_TIMEOUT_MS,
    });
    const choice = response.choices[0];
    if (choice?.finish_reason === 'length') {
      this.logger.warn(`Reply hit the ${params.maxTokens ?? DEFAULTS.maxTokens} token ceiling.`);
    }
    return {
      content: choice?.message?.content?.trim() || null,
      toolCalls: (choice?.message?.tool_calls ?? []).flatMap(toToolCall),
      model: response.model,
      usage: usageOf(response.usage),
      provider: LLMIntegration.OPENAI,
    };
  }

  async *chatStream(params: LLMChatParams): AsyncGenerator<LLMStreamEvent> {
    const stream = await this.client.chat.completions.create(
      { ...this.body(params), stream: true, stream_options: { include_usage: true } },
      { timeout: CHAT_TIMEOUT_MS },
    );

    let content = '';
    const calls = new Map<number, LLMToolCall>();
    let model: string = params.model ?? DEFAULTS.model;
    let usage: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    for await (const chunk of stream) {
      if (chunk.model) model = chunk.model;
      if (chunk.usage) usage = usageOf(chunk.usage);

      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        content += delta.content;
        yield { type: 'text', text: delta.content };
      }
      for (const call of delta?.tool_calls ?? []) {
        const current = calls.get(call.index) ?? { id: '', name: '', arguments: '' };
        if (call.id) current.id = call.id;
        if (call.function?.name) current.name += call.function.name;
        if (call.function?.arguments) current.arguments += call.function.arguments;
        calls.set(call.index, current);
      }
    }

    yield {
      type: 'done',
      content: content.trim() || null,
      toolCalls: [...calls.values()],
      model,
      usage,
    };
  }

  private body(params: LLMChatParams): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
    return {
      model: params.model ?? DEFAULTS.model,
      messages: params.messages.map(toMessage),
      max_tokens: params.maxTokens ?? DEFAULTS.maxTokens,
      temperature: params.temperature ?? DEFAULTS.temperature,
      ...(params.tools?.length
        ? {
            tools: params.tools.map((tool) => ({
              type: 'function' as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
            tool_choice: params.toolChoice ?? 'auto',
          }
        : {}),
    };
  }
}

function toMessage(message: LLMMessage): OpenAI.Chat.ChatCompletionMessageParam {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId ?? '', content: message.content ?? '' };
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  if (message.role === 'system') return { role: 'system', content: message.content ?? '' };
  if (message.role === 'assistant') return { role: 'assistant', content: message.content ?? '' };
  return { role: 'user', content: message.content ?? '' };
}

function toToolCall(call: OpenAI.Chat.ChatCompletionMessageToolCall): LLMToolCall[] {
  if (call.type !== 'function') return [];
  return [{ id: call.id, name: call.function.name, arguments: call.function.arguments }];
}

function usageOf(usage: OpenAI.CompletionUsage | null | undefined): LLMUsage {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}
