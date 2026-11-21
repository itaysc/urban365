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

  it('says a tool reply itself and does not let the model continue', async () => {
    const registry = new ToolRegistry();
    registry.add({
      name: 'estimate_value',
      description: 'שווי',
      audiences: ['end-user'],
      group: 'pricing',
      auth: false,
      confirm: false,
      moduleName: 'TestModule',
      parameters: { type: 'object', properties: {} },
      invoke: async () => ({ summary: 'שאל', reply: 'באיזו קומה?' }),
    });

    const transcript = blank();
    const runtime = runtimeWith(registry, transcript, [
      { content: null, toolCalls: [{ id: 'call-1', name: 'estimate_value', arguments: '{}' }] },
      { content: 'הנה מחיר.', toolCalls: [] },
    ]);

    const events = [];
    for await (const event of runtime.chat(agent, caller(), 'שלום')) {
      events.push(event);
    }

    const text = events
      .filter((event) => event.event === 'text')
      .map((event) => (event.event === 'text' ? event.data.delta : ''))
      .join('');
    expect(text).toBe('באיזו קומה?');
    expect(transcript.messages.at(-1)?.content).toBe('באיזו קומה?');
  });

  it('asks for the missing valuation details before the model can price the flat', async () => {
    const registry = new ToolRegistry();
    const transcript = blank();
    const runtime = runtimeWith(registry, transcript, [{ content: 'הטווח הוא 2,200,000.', toolCalls: [] }]);
    const said =
      'אני רוצה למכור דירת 4 חדרים ברחוב דב הוז בחולון. זה בניין שעבר תמ״ לפני 10 שנים. יש מרפסת 10 מטר. ממ״ד וחניה פרטית חצי מקורה. גודל הדירה 97 מ״ר. הדירה במצב סביר, דורשת שיפוץ קל. מה מחיר הדירה?';

    const events = [];
    for await (const event of runtime.chat(agent, caller(), said)) {
      events.push(event);
    }

    const text = events
      .filter((event) => event.event === 'text')
      .map((event) => (event.event === 'text' ? event.data.delta : ''))
      .join('');
    expect(text).toContain('כדי לתת הערכת מחיר טובה יותר');
    expect(JSON.stringify(events)).toContain('"component":"ChoicePicker"');
    expect(JSON.stringify(events)).toContain('מעלית');
    expect(text).not.toContain('2,200,000');
    expect(transcript.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('prices a filled valuation from the words, not from a number the model invented', async () => {
    const seen: string[] = [];
    const registry = new ToolRegistry();
    registry.add({
      name: 'estimate_value',
      description: 'שווי',
      audiences: ['end-user'],
      group: 'pricing',
      auth: false,
      confirm: false,
      moduleName: 'TestModule',
      parameters: { type: 'object', properties: {} },
      invoke: async (args) => {
        seen.push(JSON.stringify(args));
        return { summary: 'טווח שווי 2,100,000–2,400,000.', cards: [{ type: 'valuation', low: 2_100_000, high: 2_400_000, verdict: 'good', city: 'חולון' }] };
      },
    });

    const transcript = blank();
    const runtime = runtimeWith(registry, transcript, [{ content: 'לדעתי 9,999,999.', toolCalls: [] }]);
    const said = 'אני רוצה הערכת שווי לדירה. בעיר חולון, רחוב דב הוז, 4 חדרים, 97 מ״ר';

    const events = [];
    for await (const event of runtime.chat(agent, caller(), said)) {
      events.push(event);
    }

    const text = events
      .filter((event) => event.event === 'text')
      .map((event) => (event.event === 'text' ? event.data.delta : ''))
      .join('');
    expect(seen).toEqual(['{"city":"חולון","street":"דב הוז","rooms":4,"area":97}']);
    expect(text).toContain('2,100,000');
    expect(text).not.toContain('9,999,999');
  });

  it('asks the office assistant for the same missing details', async () => {
    const registry = new ToolRegistry();
    const transcript = blank();
    const runtime = runtimeWith(registry, transcript, [{ content: 'הטווח הוא 2,150,000.', toolCalls: [] }]);
    const said =
      'אני רוצה למכור דירת 4 חדרים ברחוב דב הוז בחולון. יש מרפסת 10 מטר. ממ״ד וחניה. 97 מ״ר. מצב סביר. מה מחיר הדירה?';

    const events = [];
    for await (const event of runtime.chat({ ...agent, id: 'agency' }, caller(), said)) {
      events.push(event);
    }

    const text = events
      .filter((event) => event.event === 'text')
      .map((event) => (event.event === 'text' ? event.data.delta : ''))
      .join('');
    expect(text).toContain('כדי לתת הערכת מחיר טובה יותר');
    expect(JSON.stringify(events)).toContain('מעלית');
    expect(text).not.toContain('2,150,000');
  });

  it('reprices the last valuation when a detail arrives after the answer', async () => {
    const seen: string[] = [];
    const registry = new ToolRegistry();
    registry.add({
      name: 'estimate_value',
      description: 'שווי',
      audiences: ['end-user', 'agency'],
      group: 'pricing',
      auth: false,
      confirm: false,
      moduleName: 'TestModule',
      parameters: { type: 'object', properties: {} },
      invoke: async (_args, ctx) => {
        seen.push(ctx.said ?? '');
        return {
          summary: 'לעומת ההערכה הקודמת (2,320,000 ₪–2,670,000 ₪), הטווח עכשיו 2,280,000 ₪–2,620,000 ₪. נוף −4.0%, הבניין +2.5%.',
          cards: [{ type: 'valuation', low: 2_280_000, high: 2_620_000, verdict: 'steady', city: 'חולון' }],
        };
      },
    });

    const transcript = blank();
    transcript.messages.push(
      { role: 'user', content: 'מה מחיר הדירה?' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'estimate_value', arguments: '{"city":"חולון","rooms":4,"area":97}' }],
      },
      {
        role: 'tool',
        content: 'טווח',
        toolName: 'estimate_value',
        toolCallId: 'call-1',
        cards: [
          {
            type: 'valuation',
            low: 2_320_000,
            high: 2_670_000,
            expected: 2_490_000,
            asking: 2_540_000,
            verdict: 'steady',
            city: 'חולון',
            parts: [{ label: 'חניה', factor: 1.03 }],
          },
        ],
      },
      { role: 'assistant', content: 'הטווח הוא 2,320,000 עד 2,670,000.' },
    );
    const runtime = runtimeWith(registry, transcript, [{ content: 'הטווח הוא 9,999,999.', toolCalls: [] }]);

    const events = [];
    for await (const event of runtime.chat(agent, caller(), 'נוף חסום, בניין במצב טוב')) {
      events.push(event);
    }

    const text = events
      .filter((event) => event.event === 'text')
      .map((event) => (event.event === 'text' ? event.data.delta : ''))
      .join('');
    expect(seen[0]).toContain('נוף חסום, בניין במצב טוב');
    expect(text).toContain('לעומת ההערכה הקודמת');
    expect(text).toContain('נוף −4.0%');
    expect(text).toContain('הבניין +2.5%');
    expect(text).not.toContain('כדי לתת הערכת מחיר');
    expect(text).not.toContain('9,999,999');
  });

  it('asks for the mortgage inputs before the model can invent a payment', async () => {
    const registry = new ToolRegistry();
    const transcript = blank();
    const runtime = runtimeWith(registry, transcript, [{ content: 'ההחזר הוא 5,000 לחודש.', toolCalls: [] }]);

    const events = [];
    for await (const event of runtime.chat(
      agent,
      caller(),
      'אני רוצה לבדוק מה יהיה ההחזר החודשי שלי במשכנתא',
    )) {
      events.push(event);
    }

    const text = events
      .filter((event) => event.event === 'text')
      .map((event) => (event.event === 'text' ? event.data.delta : ''))
      .join('');
    expect(text).toContain('מחיר הדירה');
    expect(text).toContain('הון עצמי');
    expect(text).toContain('דירה ראשונה');
    expect(text).not.toContain('5,000');
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

    for await (const event of runtime.chat(agent, caller(), 'תחשב')) {
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
