import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentsConfig } from '../../config/configuration.js';
import { CONVERSATION_SUMMARY_LLM } from '../../llm/llm.defaults.js';
import { LlmService } from '../../llm/llm.service.js';
import type { LLMChatResponse, LLMMessage, LLMStreamEvent, LLMToolCall } from '../../llm/llm.types.js';
import type {
  AgentCard,
  AgentContext,
  AgentDefinition,
  AgentPageContext,
  ToolResult,
  Transcript,
  TranscriptMessage,
} from './agent.types.js';
import { ConversationStore } from './conversation.store.js';
import { estimateTokens } from './tokens.js';
import { ENABLE_GROUPS, toolSchemaTokens, visibleToolSpecs } from './tool-selection.js';
import { ToolRegistry } from './tool-registry.js';
import { intakeFollowUp, matchIntake, pendingToolIntake } from '../end-user/tool-intake.js';
import { valuationFormCard } from '../end-user/valuation-form.js';
import {
  addsValuationDetail,
  asksForOneFlat,
  filledValuationForm,
  pendingValuationQuestion,
  userSkipped,
  VALUATION_QUESTION_LEAD,
  valuationInputs,
} from '../end-user/valuation-from-text.js';

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
      {
        agentId: agent.id,
        userId: ctx.principal?.userId ?? null,
        visitorId: ctx.visitorId,
        agencyId: ctx.agencyId ?? null,
      },
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

    const users = transcript.messages.filter((item) => item.role === 'user').map((item) => item.content);
    const lastAssistant = [...transcript.messages].reverse().find((item) => item.role === 'assistant' && item.content)?.content;
    const alreadyPriced = transcript.messages.some((item) => item.cards?.some((card) => card.type === 'valuation'));
    const question = pendingValuationQuestion(users, lastAssistant, alreadyPriced) ?? pendingToolIntake(users, lastAssistant);
    if (question) {
      const form = question.startsWith(VALUATION_QUESTION_LEAD) ? valuationFormCard(users.join('\n')) : null;
      if (form) yield { event: 'cards', data: { cards: [form] } };
      yield { event: 'text', data: { delta: question } };
      const spoken: TranscriptMessage = { role: 'assistant', content: question, ...(form ? { cards: [form] } : {}) };
      transcript.messages.push(spoken);
      await this.store.append(transcript.id, [spoken]);
      yield { event: 'done', data: { conversationId: transcript.id } };
      return;
    }

    const latest = users.at(-1) ?? '';
    if (alreadyPriced && !asksForOneFlat(latest) && addsValuationDetail(latest)) {
      const previousCall = [...transcript.messages]
        .reverse()
        .flatMap((item) => item.toolCalls ?? [])
        .find((call) => call.name === 'estimate_value');
      if (previousCall) {
        ctx.said = users.join('\n');
        ctx.latestUserMessage = latest;
        ctx.detailsAnswered = true;
        ctx.recentCards = recentCards(transcript.messages);
        const callId = `reprice-${transcript.messages.length}`;
        const result = await this.callTool(agent, ctx, { id: callId, name: 'estimate_value', arguments: previousCall.arguments }, ['pricing']);
        if (result.cards?.some((card) => card.type === 'valuation')) {
          const rows: TranscriptMessage[] = [
            {
              role: 'assistant',
              content: '',
              toolCalls: [{ id: callId, name: 'estimate_value', arguments: previousCall.arguments }],
            },
            {
              role: 'tool',
              content: result.summary,
              toolName: 'estimate_value',
              toolCallId: callId,
              cards: result.cards,
            },
            { role: 'assistant', content: result.summary },
          ];
          transcript.messages.push(...rows);
          await this.store.append(transcript.id, rows);
          if (result.cards?.length) yield { event: 'cards', data: { cards: result.cards } };
          yield { event: 'text', data: { delta: result.summary } };
          yield { event: 'done', data: { conversationId: transcript.id } };
          return;
        }
      }
    }

    // A valuation the person has described is priced here, from those words, on the
    // street point the valuation page uses. The model does not get to swap the rooms,
    // the area, or the place for numbers it invented.
    const saidNow = users.join('\n');
    const heard = valuationInputs(saidNow);
    const priceNow =
      asksForOneFlat(saidNow) &&
      (asksForOneFlat(latest) || filledValuationForm(latest) || userSkipped(latest)) &&
      heard.city !== null &&
      heard.street !== null &&
      heard.rooms !== null &&
      heard.area !== null &&
      this.registry.forAgent(agent, this.excludedModules(agent)).some((tool) => tool.name === 'estimate_value');
    if (priceNow) {
      ctx.said = saidNow;
      ctx.latestUserMessage = latest;
      ctx.detailsAnswered = true;
      ctx.recentCards = recentCards(transcript.messages);
      const callId = `value-${transcript.messages.length}`;
      const args = JSON.stringify({ city: heard.city, street: heard.street, rooms: heard.rooms, area: heard.area });
      const result = await this.callTool(agent, ctx, { id: callId, name: 'estimate_value', arguments: args }, ['pricing']);
      const rows: TranscriptMessage[] = [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: callId, name: 'estimate_value', arguments: args }],
        },
        {
          role: 'tool',
          content: result.summary,
          toolName: 'estimate_value',
          toolCallId: callId,
          cards: result.cards,
        },
        { role: 'assistant', content: result.reply ?? result.summary },
      ];
      transcript.messages.push(...rows);
      await this.store.append(transcript.id, rows);
      if (result.cards?.length) yield { event: 'cards', data: { cards: result.cards } };
      yield { event: 'text', data: { delta: result.reply ?? result.summary } };
      yield { event: 'done', data: { conversationId: transcript.id } };
      return;
    }

    const said = users.join('\n');
    const enabledGroups: string[] = asksForOneFlat(said) ? ['pricing'] : [];
    const intake = matchIntake(said);
    if (intake && !enabledGroups.includes(intake.group)) enabledGroups.push(intake.group);

    for (let round = 0; round < agent.budget.maxRounds; round++) {
      await this.compact(agent, transcript);

      const tools = this.registry.forAgent(agent, this.excludedModules(agent));
      const specs = visibleToolSpecs(tools, enabledGroups, agent.budget.groupThreshold);
      let response: LLMChatResponse;

      try {
        response = yield* this.complete(agent, toModelMessages(agent, transcript, ctx.page), specs);
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

      const said = transcript.messages.filter((message) => message.role === 'user').map((message) => message.content);
      ctx.said = said.join('\n');
      ctx.latestUserMessage = said.at(-1) ?? '';
      ctx.detailsAnswered = transcript.messages.some(
        (message) => message.role === 'assistant' && message.content.startsWith(VALUATION_QUESTION_LEAD),
      );

      let waitingConfirm = false;
      const replies: string[] = [];
      for (const call of response.toolCalls) {
        ctx.recentCards = shown;
        ctx.pendingToolCallId = call.id;
        ctx.confirmedToolCallId = undefined;
        const result = await this.callTool(agent, ctx, call, enabledGroups);
        if (result.cards?.length) shown.push(...result.cards);
        if (result.reply) replies.push(result.reply);
        if (call.name !== ENABLE_GROUPS) yield { event: 'tool', data: { name: call.name } };
        if (result.cards?.length) yield { event: 'cards', data: { cards: result.cards } };
        if (result.needsSignIn) yield { event: 'sign_in', data: { conversationId: transcript.id } };
        if (result.needsConfirm) waitingConfirm = true;

        toolMessages.push({
          role: 'tool',
          content: result.summary,
          toolName: call.name,
          toolCallId: call.id,
          cards: result.cards,
          needsSignIn: result.needsSignIn,
          pendingConfirm: result.pendingConfirm,
        });
      }

      transcript.messages.push(assistant, ...toolMessages);
      await this.store.append(transcript.id, [assistant, ...toolMessages]);

      // The tool already asked the person. Another model round would answer past the
      // question, which is how a valuation used to skip the floor and the lift.
      if (!waitingConfirm && replies.length > 0) {
        const reply = [...new Set(replies)].join('\n\n');
        yield { event: 'text', data: { delta: reply } };
        const spoken: TranscriptMessage = { role: 'assistant', content: reply };
        transcript.messages.push(spoken);
        await this.store.append(transcript.id, [spoken]);
        yield { event: 'done', data: { conversationId: transcript.id } };
        return;
      }

      // A write is parked on a confirm card. Do not ask the model again until אשר runs —
      // otherwise it invents a success the database never saw.
      if (waitingConfirm) {
        yield { event: 'done', data: { conversationId: transcript.id } };
        return;
      }
    }

    const stopped = 'הגעתי למגבלת הצעדים לסוגיה הזו. נסח אותה שוב, קצר יותר.';
    yield { event: 'text', data: { delta: stopped } };
    await this.store.append(transcript.id, [{ role: 'assistant', content: stopped }]);
    yield { event: 'done', data: { conversationId: transcript.id } };
  }

  /**
   * Runs a write the person approved on a confirm card, then lets the model react once.
   */
  async *confirm(
    agent: AgentDefinition,
    ctx: AgentContext,
    conversationId: string,
    toolCallId: string,
    accept: boolean,
  ): AsyncGenerator<AgentEvent> {
    if (!this.llm.isConfigured()) {
      yield { event: 'error', data: { message: 'העוזר לא זמין כרגע.' } };
      return;
    }

    const transcript = await this.store.open(
      {
        agentId: agent.id,
        userId: ctx.principal?.userId ?? null,
        visitorId: ctx.visitorId,
        agencyId: ctx.agencyId ?? null,
      },
      conversationId,
    );
    yield { event: 'ready', data: { conversationId: transcript.id } };

    const pending = await this.store.pendingConfirm(transcript.id, toolCallId);
    if (!pending) {
      yield { event: 'error', data: { message: 'הפעולה כבר בוצעה או בוטלה.' } };
      yield { event: 'done', data: { conversationId: transcript.id } };
      return;
    }

    if (!accept) {
      const cancelledCard: AgentCard = {
        type: 'confirm',
        toolCallId,
        toolName: pending.toolName,
        label: pending.label,
        detail: pending.detail,
        status: 'cancelled',
      };
      await this.store.replaceToolMessage(transcript.id, toolCallId, {
        content: `בוטל: ${pending.label}.`,
        cards: [cancelledCard],
        pendingConfirm: null,
      });
      yield { event: 'cards', data: { cards: [cancelledCard] } };
      yield { event: 'text', data: { delta: 'ביטלתי את הפעולה.' } };
      await this.store.append(transcript.id, [{ role: 'assistant', content: 'ביטלתי את הפעולה.' }]);
      yield { event: 'done', data: { conversationId: transcript.id } };
      return;
    }

    ctx.pendingToolCallId = toolCallId;
    ctx.confirmedToolCallId = toolCallId;
    ctx.recentCards = recentCards(transcript.messages);
    const result = await this.registry.invoke(
      agent,
      this.excludedModules(agent),
      pending.toolName,
      pending.args,
      ctx,
    );

    const doneCard: AgentCard = {
      type: 'confirm',
      toolCallId,
      toolName: pending.toolName,
      label: pending.label,
      detail: pending.detail,
      status: 'done',
    };
    const cards = [...(result.cards ?? []), doneCard];
    await this.store.replaceToolMessage(transcript.id, toolCallId, {
      content: result.summary,
      cards,
      pendingConfirm: null,
    });
    // Keep the in-memory transcript aligned for the follow-up model call.
    for (const message of transcript.messages) {
      if (message.role === 'tool' && message.toolCallId === toolCallId) {
        message.content = result.summary;
        message.cards = cards;
        message.pendingConfirm = undefined;
      }
    }

    yield { event: 'tool', data: { name: pending.toolName } };
    yield { event: 'cards', data: { cards } };

    try {
      const tools = this.registry.forAgent(agent, this.excludedModules(agent));
      const specs = visibleToolSpecs(tools, [], agent.budget.groupThreshold);
      const response = yield* this.complete(agent, toModelMessages(agent, transcript, ctx.page), specs);
      transcript.tokensUsed += response.usage.totalTokens;
      await this.store.addTokens(transcript.id, response.usage.totalTokens);
      const content = response.content ?? '';
      if (content) {
        await this.store.append(transcript.id, [{ role: 'assistant', content }]);
      }
    } catch (error) {
      this.logger.warn(`Confirm follow-up failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }

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
  ): Promise<ToolResult> {
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

function toModelMessages(
  agent: AgentDefinition,
  transcript: Transcript,
  page?: AgentPageContext | null,
): LLMMessage[] {
  const turns = splitTurns(transcript.messages);
  const recent = turns.slice(-agent.budget.historyTurns);
  const messages: LLMMessage[] = [{ role: 'system', content: agent.systemPrompt() }];

  const pageLine = pageContextLine(page);
  if (pageLine) {
    messages.push({ role: 'system', content: pageLine });
  }

  if (transcript.summary) {
    messages.push({ role: 'system', content: `סיכום השיחה עד כאן:\n${transcript.summary}` });
  }

  const update = valuationUpdateLine(transcript);
  if (update) messages.push({ role: 'system', content: update });
  const followUp = intakeFollowUp(
    [...transcript.messages].reverse().find((message) => message.role === 'assistant' && message.content)?.content,
  );
  if (followUp) messages.push({ role: 'system', content: followUp });

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

function valuationUpdateLine(transcript: Transcript): string | null {
  const priced = transcript.messages.some((message) => message.cards?.some((card) => card.type === 'valuation'));
  if (!priced) return null;
  const latest = [...transcript.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  if (!addsValuationDetail(latest)) return null;
  return 'כבר ניתנה הערכת שווי בשיחה. המשתמש הוסיף פרט. קרא ל-estimate_value עם כל מה שנאמר עד עכשיו. אמור אם הפרט מזיז את הטווח הקודם ובכמה, לפי המשפט שהכלי החזיר על ההפרש. אל תשאל שוב את רשימת הפרטים.';
}

function pageContextLine(page?: AgentPageContext | null): string | null {
  if (!page) return null;
  const KIND: Record<AgentPageContext['kind'], string> = {
    customer: 'לקוח',
    lead: 'פנייה',
    deal: 'עסקה',
    listing: 'נכס',
    calendar: 'יומן',
    mortgage_case: 'תיק משכנתא',
    banker: 'אנשי קשר בבנקים',
    page: 'מסך',
  };
  const label = KIND[page.kind] ?? page.kind;
  if (page.id) {
    return `המסך הפתוח עכשיו: ${label} (מזהה ${page.id}, נתיב ${page.path}). כשמבקשים את הסטטוס או "הלקוח"/"הפנייה" בלי לציין מי, הכוונה לפריט הזה.`;
  }
  return `המסך הפתוח עכשיו: ${label} (נתיב ${page.path}).`;
}
