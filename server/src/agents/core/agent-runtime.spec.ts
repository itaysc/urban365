import { ConfigService } from '@nestjs/config';
import { END_USER_AGENT_LLM } from '../../llm/llm.defaults.js';
import type { LlmService } from '../../llm/llm.service.js';
import type { LLMStreamEvent, LLMToolCall } from '../../llm/llm.types.js';
import type { AgentCard, AgentContext, AgentDefinition, Transcript, TranscriptMessage } from './agent.types.js';
import { AgentRuntime, RECENT_CARD_MESSAGES } from './agent-runtime.js';
import type { ConversationStore } from './conversation.store.js';
import { ToolRegistry } from './tool-registry.js';

const agent: AgentDefinition = {
  id: 'end-user',
  audience: 'end-user',
  access: 'anonymous',
  preset: END_USER_AGENT_LLM,
  systemPrompt: () => 'עוזר',
  budget: {
    maxRounds: 4,
    historyTurns: 2,
    conversationTokens: 100,
    toolSchemaTokens: 1000,
    groupThreshold: 20,
  },
};

describe('AgentRuntime', () => {
  it('calls the tool the model asked for and then answers from its result', async () => {
    const seen: string[] = [];
    const registry = new ToolRegistry();
    registry.add({
      name: 'search_listings',
      description: 'חיפוש',
      audiences: ['end-user'],
      group: 'search',
      auth: false,
      confirm: false,
      moduleName: 'TestModule',
      parameters: { type: 'object', properties: {} },
      invoke: async () => {
        seen.push('search_listings');
        return { summary: 'נמצאו 2' };
      },
    });

    const transcript = blank();
    const runtime = runtimeWith(registry, transcript, [
      { content: null, toolCalls: [{ id: 'call-1', name: 'search_listings', arguments: '{}' }] },
      { content: 'יש שתי דירות.', toolCalls: [] },
    ]);

    const events = [];
    for await (const event of runtime.chat(agent, { agentId: 'end-user', principal: null, visitorId: 'v1' }, 'דירות')) {
      events.push(event);
    }

    expect(seen).toEqual(['search_listings']);
    expect(events.map((event) => event.event)).toContain('text');
    expect(transcript.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(transcript.messages[2]?.content).toBe('נמצאו 2');
  });

  it('stops a conversation that has already spent its token budget', async () => {
    const registry = new ToolRegistry();
    const transcript = blank();
    transcript.tokensUsed = 100;
    const runtime = runtimeWith(registry, transcript, []);

    const events = [];
    for await (const event of runtime.chat(agent, { agentId: 'end-user', principal: null, visitorId: 'v1' }, 'עוד')) {
      events.push(event);
    }

    expect(events.map((event) => event.event)).toEqual(['ready', 'error', 'done']);
  });

  it('shows a tool the cards from the last few messages, and cards it just drew', async () => {
    const seen: AgentCard[][] = [];
    const registry = new ToolRegistry();
    const link: AgentCard = { type: 'link', href: '/mortgage', label: 'מחשבון המשכנתא' };
    registry.add({
      name: 'mortgage_plan',
      description: 'משכנתא',
      audiences: ['end-user'],
      group: 'mortgage',
      auth: false,
      confirm: false,
      moduleName: 'TestModule',
      parameters: { type: 'object', properties: {} },
      invoke: async (_args, ctx) => {
        seen.push([...(ctx.recentCards ?? [])]);
        return { summary: 'החזר', cards: [link] };
      },
    });
    registry.add({
      name: 'compare_mix',
      description: 'תמהיל',
      audiences: ['end-user'],
      group: 'mortgage',
      auth: false,
      confirm: false,
      moduleName: 'TestModule',
      parameters: { type: 'object', properties: {} },
      invoke: async (_args, ctx) => {
        seen.push([...(ctx.recentCards ?? [])]);
        return { summary: 'תמהיל' };
      },
    });

    const search: AgentCard = { type: 'link', href: '/search', label: 'חיפוש' };
    const transcript = blank();
    transcript.messages = [
      { role: 'tool', content: 'ישן', cards: [{ type: 'link', href: '/mortgage?price=1', label: 'מחשבון המשכנתא' }] },
      ...Array.from({ length: RECENT_CARD_MESSAGES - 1 }, (): TranscriptMessage => ({ role: 'user', content: 'ישן' })),
      { role: 'assistant', content: 'הנה', cards: [search] },
    ];
    const runtime = runtimeWith(registry, transcript, [
      {
        content: null,
        toolCalls: [
          { id: 'call-1', name: 'mortgage_plan', arguments: '{}' },
          { id: 'call-2', name: 'compare_mix', arguments: '{}' },
        ],
      },
      { content: 'הנה החישוב.', toolCalls: [] },
    ]);

    for await (const event of runtime.chat(agent, caller(), 'כמה החזר')) {
      void event;
    }

    expect(seen[0]).toEqual([search]);
    expect(seen[1]).toEqual([search, link]);
  });

  it('reads a signed-in override from the environment', () => {
    const runtime = runtimeWith(new ToolRegistry(), blank(), [], { 'end-user': { access: 'signed-in', excludedModules: [] } });
    expect(runtime.access(agent)).toBe('signed-in');
  });
});

function caller(): AgentContext {
  return { agentId: 'end-user', principal: null, visitorId: 'v1' };
}

function blank(): Transcript {
  return {
    id: 'c1',
    agentId: 'end-user',
    userId: null,
    visitorId: 'v1',
    summary: '',
    summaryCovers: 0,
    tokensUsed: 0,
    messages: [],
  };
}

function runtimeWith(
  registry: ToolRegistry,
  transcript: Transcript,
  rounds: { content: string | null; toolCalls: LLMToolCall[] }[],
  byAgent: Record<string, { access: 'anonymous' | 'signed-in'; excludedModules: string[] }> = {},
): AgentRuntime {
  let cursor = 0;
  const llm = {
    isConfigured: () => true,
    async ask() {
      return { data: 'סיכום', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 1 } };
    },
    async *chatStream(): AsyncGenerator<LLMStreamEvent> {
      const round = rounds[cursor++] ?? { content: '', toolCalls: [] };
      if (round.content) yield { type: 'text', text: round.content };
      yield {
        type: 'done',
        content: round.content,
        toolCalls: round.toolCalls,
        model: 'gpt-4o-mini',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };
    },
  };

  const store = {
    async open() {
      return transcript;
    },
    async append() {
      // The runtime keeps the transcript it was given and writes through here.
      // Persistence is a no-op in the test; the array is already updated.
    },
    async setSummary() {},
    async addTokens(_id: string, tokens: number) {
      transcript.tokensUsed += tokens;
    },
  };

  const config = {
    getOrThrow: () => ({ excludedModules: [], byAgent }),
  };

  return new AgentRuntime(llm as unknown as LlmService, registry, store as unknown as ConversationStore, config as unknown as ConfigService);
}
