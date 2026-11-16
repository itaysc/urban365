import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentsConfig } from '../../config/configuration.js';
import { CONVERSATION_SUMMARY_LLM } from '../../llm/llm.defaults.js';
import { LlmService } from '../../llm/llm.service.js';
import type { LLMChatResponse, LLMMessage, LLMStreamEvent, LLMToolCall } from '../../llm/llm.types.js';
import type { AgentCard, AgentContext, AgentDefinition, Transcript, TranscriptMessage } from './agent.types.js';
import { ConversationStore } from './conversation.store.js';
import { estimateTokens } from './tokens.js';
import { ENABLE_GROUPS, toolSchemaTokens, visibleToolSpecs } from './tool-selection.js';
import { ToolRegistry } from './tool-registry.js';

export type AgentEvent =
  | { event: 'ready'; data: { conversationId: string } }
  | { event: 'text'; data: { delta: string } }
  | { event: 'tool'; data: { name: string } }
  | { event: 'cards'; data: { cards: AgentCard[] } }
  | { event: 'sign_in'; data: { conversationId: string } }
  | { event: 'done'; data: { conversationId: string } }
  | { event: 'error'; data: { message: string } };

const FULL_TOOL_TURNS = 2;

/** Cards from this many recent messages are shown to tools, so a link is not repeated immediately. */
export const RECENT_CARD_MESSAGES = 8;

/**
 * The loop every agent runs: model, tools, model again.
 *
 * What is sent is the expensive part, so it is decided here and nowhere else. The
 * system prompt, a short summary of whatever scrolled off, and the last few turns.
 * Tool results older than the last couple of turns are cut to a line. The cards the
 * browser drew are never sent back.
 */
@Injectable()
export class AgentRuntime {
  private readonly logger = new Logger(AgentRuntime.name);
  private readonly config: AgentsConfig;

  constructor(
    private readonly llm: LlmService,
    private readonly registry: ToolRegistry,
    private readonly store: ConversationStore,
    config: ConfigService,
  ) {
    this.config = config.getOrThrow<AgentsConfig>('agents');
  }

  /** The modules this agent must not be able to call, global list plus its own. */
  excludedModules(agent: AgentDefinition): string[] {
    const own = this.config.byAgent[agent.id]?.excludedModules ?? [];
    return [...new Set([...this.config.excludedModules, ...own])];
  }

  access(agent: AgentDefinition): AgentDefinition['access'] {
    return this.config.byAgent[agent.id]?.access ?? agent.access;
  }

  /**
   * Fails the boot when an agent's tools no longer fit the budget.
   * A schema that grew past it would be paid for on every message.
   */
  assertBudget(agent: AgentDefinition): void {
    const tools = this.registry.forAgent(agent, this.excludedModules(agent));
    const tokens = toolSchemaTokens(visibleToolSpecs(tools, [], agent.budget.groupThreshold));
    if (tokens > agent.budget.toolSchemaTokens) {
      throw new Error(
        `${agent.id} tool schemas are about ${tokens} tokens, over the ${agent.budget.toolSchemaTokens} budget.`,
      );
    }
    this.logger.log(`${agent.id}: ${tools.map((tool) => tool.name).join(', ') || 'no tools'} (~${tokens} schema tokens)`);
  }

  async *chat(agent: AgentDefinition, ctx: AgentContext, message: string, conversationId?: string): AsyncGenerator<AgentEvent> {
    if (!this.llm.isConfigured()) {
      yield { event: 'error', data: { message: 'העוזר לא זמין כרגע.' } };
      return;
    }

    const transcript = await this.store.open(
      { agentId: agent.id, userId: ctx.principal?.userId ?? null, visitorId: ctx.visitorId },
      conversationId,
    );
    yield { event: 'ready', data: { conversationId: transcript.id } };

    if (transcript.tokensUsed >= agent.budget.conversationTokens) {
      yield { event: 'error', data: { message: 'השיחה הזו ארוכה מדי. פתח שיחה חדשה.' } };
      yield { event: 'done', data: { conversationId: transcript.id } };
      return;
    }

    const user: TranscriptMessage = { role: 'user', content: message };
    transcript.messages.push(user);
    await this.store.append(transcript.id, [user]);

    const enabledGroups: string[] = [];

    for (let round = 0; round < agent.budget.maxRounds; round++) {
      await this.compact(agent, transcript);

      const tools = this.registry.forAgent(agent, this.excludedModules(agent));
      const specs = visibleToolSpecs(tools, enabledGroups, agent.budget.groupThreshold);
      let response: LLMChatResponse;

      try {
        response = yield* this.complete(agent, toModelMessages(agent, transcript), specs);
      } catch (error) {
        this.logger.warn(`Agent call failed: ${error instanceof Error ? error.message : 'unknown'}`);
        yield { event: 'error', data: { message: 'משהו השתבש. נסה שוב.' } };
        yield { event: 'done', data: { conversationId: transcript.id } };
        return;
      }

      transcript.tokensUsed += response.usage.totalTokens;
      await this.store.addTokens(transcript.id, response.usage.totalTokens);
      this.logger.debug(`${agent.id} ${response.usage.totalTokens} tokens (conversation ${transcript.tokensUsed})`);

      if (response.toolCalls.length === 0) {
        const content = response.content ?? '';
        const assistant: TranscriptMessage = { role: 'assistant', content };
        transcript.messages.push(assistant);
        await this.store.append(transcript.id, [assistant]);
        yield { event: 'done', data: { conversationId: transcript.id } };
        return;
      }

      const assistant: TranscriptMessage = {
        role: 'assistant',
        content: response.content ?? '',
        toolCalls: response.toolCalls,
      };
      const toolMessages: TranscriptMessage[] = [];
      const shown = recentCards(transcript.messages);

      for (const call of response.toolCalls) {
        ctx.recentCards = shown;
        const result = await this.callTool(agent, ctx, call, enabledGroups);
        if (result.cards?.length) shown.push(...result.cards);
        if (call.name !== ENABLE_GROUPS) yield { event: 'tool', data: { name: call.name } };
        if (result.cards?.length) yield { event: 'cards', data: { cards: result.cards } };
        if (result.needsSignIn) yield { event: 'sign_in', data: { conversationId: transcript.id } };

        toolMessages.push({
          role: 'tool',
          content: result.summary,
          toolName: call.name,
          toolCallId: call.id,
          cards: result.cards,
          needsSignIn: result.needsSignIn,
        });
      }

      transcript.messages.push(assistant, ...toolMessages);
      await this.store.append(transcript.id, [assistant, ...toolMessages]);
    }

    const stopped = 'הגעתי למגבלת הצעדים לסוגיה הזו. נסח אותה שוב, קצר יותר.';
    yield { event: 'text', data: { delta: stopped } };
    await this.store.append(transcript.id, [{ role: 'assistant', content: stopped }]);
    yield { event: 'done', data: { conversationId: transcript.id } };
  }

  private async *complete(
    agent: AgentDefinition,
    messages: LLMMessage[],
    tools: ReturnType<typeof visibleToolSpecs>,
  ): AsyncGenerator<AgentEvent, LLMChatResponse> {
    const preset = agent.preset;
    let content = '';
    let done: Extract<LLMStreamEvent, { type: 'done' }> | undefined;

    for await (const event of this.llm.chatStream({
      messages,
      tools,
      model: preset.model,
      maxTokens: preset.maxTokens,
      temperature: preset.temperature,
      integration: preset.integration,
    })) {
      if (event.type === 'text') {
        content += event.text;
        yield { event: 'text', data: { delta: event.text } };
      } else {
        done = event;
      }
    }

    return {
      content: done?.content ?? (content.trim() || null),
      toolCalls: done?.toolCalls ?? [],
      model: done?.model ?? preset.model,
      usage: done?.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: estimateTokens(content) },
      provider: preset.integration,
    };
  }

  private async callTool(
    agent: AgentDefinition,
    ctx: AgentContext,
    call: LLMToolCall,
    enabledGroups: string[],
  ): Promise<{ summary: string; cards?: AgentCard[]; needsSignIn?: boolean }> {
    let args: unknown;
    try {
      args = JSON.parse(call.arguments || '{}') as unknown;
    } catch {
      return { summary: 'הארגומנטים אינם JSON תקינים.' };
    }

    if (call.name === ENABLE_GROUPS) {
      const groups = (args as { groups?: unknown }).groups;
      if (Array.isArray(groups)) {
        for (const group of groups) if (typeof group === 'string' && !enabledGroups.includes(group)) enabledGroups.push(group);
      }
      return { summary: `נטענו הכלים של: ${enabledGroups.join(', ') || 'אף קבוצה'}.` };
    }

    return this.registry.invoke(agent, this.excludedModules(agent), call.name, args, ctx);
  }

  /** Folds turns that fell out of the window into the running summary, once. */
  private async compact(agent: AgentDefinition, transcript: Transcript): Promise<void> {
    const turns = splitTurns(transcript.messages);
    const older = turns.slice(0, Math.max(0, turns.length - agent.budget.historyTurns)).flat();
    if (older.length === 0 || older.length <= transcript.summaryCovers) return;

    const preset = CONVERSATION_SUMMARY_LLM;
    const text = older.map((message) => `${message.role}: ${message.content}`).join('\n').slice(0, 4000);
    const response = await this.llm.ask({
      prompt: text,
      systemMsg: 'סכם את קטע השיחה בעברית, עד 80 מילים. רק עובדות שנאמרו: מה חיפשו, מה נמצא, מה הוחלט.',
      model: preset.model,
      maxTokens: preset.maxTokens,
      temperature: preset.temperature,
      integration: preset.integration,
    });

    const summary = (response.data ?? transcript.summary).slice(0, 600);
    transcript.summary = summary;
    transcript.summaryCovers = older.length;
    transcript.tokensUsed += response.usage.totalTokens;
    await this.store.setSummary(transcript.id, summary, older.length);
    await this.store.addTokens(transcript.id, response.usage.totalTokens);
  }
}

export function agentById(agents: AgentDefinition[], id: string): AgentDefinition {
  const found = agents.find((agent) => agent.id === id);
  if (!found) throw new NotFoundException('העוזר לא נמצא.');
  return found;
}

function splitTurns(messages: TranscriptMessage[]): TranscriptMessage[][] {
  const turns: TranscriptMessage[][] = [];
  for (const message of messages) {
    if (message.role === 'user' || turns.length === 0) turns.push([message]);
    else turns[turns.length - 1].push(message);
  }
  return turns;
}

function recentCards(messages: TranscriptMessage[]): AgentCard[] {
  return messages.slice(-RECENT_CARD_MESSAGES).flatMap((message) => message.cards ?? []);
}

function toModelMessages(agent: AgentDefinition, transcript: Transcript): LLMMessage[] {
  const turns = splitTurns(transcript.messages);
  const recent = turns.slice(-agent.budget.historyTurns);
  const messages: LLMMessage[] = [{ role: 'system', content: agent.systemPrompt() }];

  if (transcript.summary) {
    messages.push({ role: 'system', content: `סיכום השיחה עד כאן:\n${transcript.summary}` });
  }

  recent.forEach((turn, index) => {
    const full = index >= recent.length - FULL_TOOL_TURNS;
    for (const message of turn) {
      if (message.role === 'tool') {
        messages.push({
          role: 'tool',
          toolCallId: message.toolCallId ?? '',
          content: full ? message.content : message.content.slice(0, 160),
        });
        continue;
      }
      messages.push({
        role: message.role,
        content: message.content || null,
        ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {}),
      });
    }
  });

  return messages;
}
