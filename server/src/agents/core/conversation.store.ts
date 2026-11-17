import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AgentsConfig } from '../../config/configuration.js';
import type { AgentCard, StoredToolCall, Transcript, TranscriptMessage } from './agent.types.js';
import { dayKey, retainedDays } from './history-window.js';

interface Caller {
  agentId: string;
  userId: string | null;
  visitorId: string | null;
}

interface ToolPayload {
  toolCalls?: StoredToolCall[];
  cards?: AgentCard[];
  needsSignIn?: boolean;
}

/**
 * Transcripts, through the table owner.
 *
 * The rows are behind row-level security with no policy, so the tenant role cannot
 * read them at all. Every read here is filtered by the caller: someone else's
 * conversation is the same answer as one that does not exist.
 */
@Injectable()
export class ConversationStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async open(caller: Caller, id?: string): Promise<Transcript> {
    await this.prune(caller, id);
    if (!id) return this.create(caller);

    const row = await this.prisma.agentConversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row || row.agentId !== caller.agentId || !owns(row, caller)) {
      throw new NotFoundException('השיחה לא נמצאה.');
    }

    // The browser that started it has since signed in. The transcript becomes theirs.
    if (caller.userId && !row.userId && row.visitorId && row.visitorId === caller.visitorId) {
      await this.prisma.agentConversation.update({ where: { id }, data: { userId: caller.userId } });
      row.userId = caller.userId;
    }

    return toTranscript(row);
  }

  async append(id: string, messages: TranscriptMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.prisma.agentMessage.createMany({
      data: messages.map((message) => {
        const payload = payloadOf(message);
        return {
          conversationId: id,
          role: message.role,
          content: message.content,
          toolName: message.toolName ?? null,
          toolCallId: message.toolCallId ?? null,
          ...(payload ? { toolPayload: payload as Prisma.InputJsonValue } : {}),
        };
      }),
    });
  }

  async setSummary(id: string, summary: string, summaryCovers: number): Promise<void> {
    await this.prisma.agentConversation.update({
      where: { id },
      data: { summary, summaryCovers },
    });
  }

  async addTokens(id: string, tokens: number): Promise<void> {
    if (tokens <= 0) return;
    await this.prisma.agentConversation.update({
      where: { id },
      data: { tokensUsed: { increment: tokens } },
    });
  }

  /**
   * Deletes this caller's transcripts for the agent, messages included.
   *
   * A signed-in person also loses the anonymous chats still sitting on this browser,
   * so clearing the panel does not leave a copy that the next visit would claim.
   */
  async clear(caller: Caller): Promise<void> {
    const where = historyWhere(caller);
    if (!where) return;
    await this.prisma.agentConversation.deleteMany({ where });
  }

  /**
   * Drops messages outside the last `AGENT_HISTORY_DAYS` days this person used the chat.
   *
   * The conversation being opened is kept even when that leaves it empty, so a
   * returning browser still has an id to append to.
   */
  private async prune(caller: Caller, exceptId?: string): Promise<void> {
    const where = ownerWhere(caller);
    if (!where) return;

    const stamps = await this.prisma.agentMessage.findMany({
      where: { conversation: where },
      select: { id: true, createdAt: true, conversationId: true },
    });
    const retained = retainedDays(
      stamps.map((row) => row.createdAt),
      this.historyDays(),
    );
    const drop = stamps.filter((row) => !retained.has(dayKey(row.createdAt)));

    if (drop.length > 0) {
      const conversations = [...new Set(drop.map((row) => row.conversationId))];
      await this.prisma.agentMessage.deleteMany({ where: { id: { in: drop.map((row) => row.id) } } });
      await this.prisma.agentConversation.updateMany({
        where: { id: { in: conversations } },
        data: { summary: '', summaryCovers: 0 },
      });
    }

    await this.prisma.agentConversation.deleteMany({
      where: {
        ...where,
        ...(exceptId ? { id: { not: exceptId } } : {}),
        messages: { none: {} },
      },
    });
  }

  private historyDays(): number {
    return this.config.get<AgentsConfig>('agents')?.historyDays ?? 3;
  }

  private async create(caller: Caller): Promise<Transcript> {
    const row = await this.prisma.agentConversation.create({
      data: { agentId: caller.agentId, userId: caller.userId, visitorId: caller.visitorId },
      include: { messages: true },
    });
    return toTranscript(row);
  }
}

/** Every conversation this caller is allowed to read. Nobody else's rows match. */
export function historyWhere(caller: Caller): Prisma.AgentConversationWhereInput | null {
  const owned: Prisma.AgentConversationWhereInput[] = [];
  if (caller.userId) owned.push({ agentId: caller.agentId, userId: caller.userId });
  if (caller.visitorId) {
    owned.push({ agentId: caller.agentId, userId: null, visitorId: caller.visitorId });
  }
  if (owned.length === 0) return null;
  return owned.length === 1 ? owned[0] : { OR: owned };
}

function ownerWhere(caller: Caller): Prisma.AgentConversationWhereInput | null {
  if (caller.userId) return { agentId: caller.agentId, userId: caller.userId };
  if (caller.visitorId) return { agentId: caller.agentId, userId: null, visitorId: caller.visitorId };
  return null;
}

function owns(row: { userId: string | null; visitorId: string | null }, caller: Caller): boolean {
  if (caller.userId && row.userId === caller.userId) return true;
  if (!caller.visitorId || row.visitorId !== caller.visitorId) return false;
  return row.userId === null || row.userId === caller.userId;
}

function payloadOf(message: TranscriptMessage): ToolPayload | undefined {
  const payload: ToolPayload = {};
  if (message.toolCalls?.length) payload.toolCalls = message.toolCalls;
  if (message.cards?.length) payload.cards = message.cards;
  if (message.needsSignIn) payload.needsSignIn = true;
  return Object.keys(payload).length > 0 ? payload : undefined;
}

export interface TranscriptViewItem {
  role: 'user' | 'assistant';
  content: string;
  cards: AgentCard[];
  needsSignIn: boolean;
}

/** What the browser redraws. Tool rows become cards; an empty assistant preamble is dropped. */
export function transcriptView(messages: TranscriptMessage[]): TranscriptViewItem[] {
  return messages.flatMap((message): TranscriptViewItem[] => {
    if (message.role === 'tool') {
      if (!message.cards?.length && !message.needsSignIn) return [];
      return [
        {
          role: 'assistant' as const,
          content: '',
          cards: message.cards ?? [],
          needsSignIn: Boolean(message.needsSignIn),
        },
      ];
    }
    if (message.role === 'assistant' && !message.content) return [];
    if (message.role === 'assistant') {
      return [{ role: 'assistant' as const, content: message.content, cards: [], needsSignIn: false }];
    }
    return [{ role: 'user' as const, content: message.content, cards: [], needsSignIn: false }];
  });
}

function toTranscript(row: {
  id: string;
  agentId: string;
  userId: string | null;
  visitorId: string | null;
  summary: string;
  summaryCovers: number;
  tokensUsed: number;
  messages: {
    role: string;
    content: string;
    toolName: string | null;
    toolCallId: string | null;
    toolPayload: Prisma.JsonValue;
  }[];
}): Transcript {
  return {
    id: row.id,
    agentId: row.agentId,
    userId: row.userId,
    visitorId: row.visitorId,
    summary: row.summary,
    summaryCovers: row.summaryCovers,
    tokensUsed: row.tokensUsed,
    messages: row.messages.map((message) => {
      const payload = (message.toolPayload ?? {}) as ToolPayload;
      const role = message.role === 'assistant' || message.role === 'tool' ? message.role : 'user';
      return {
        role,
        content: message.content,
        toolName: message.toolName,
        toolCallId: message.toolCallId,
        toolCalls: payload.toolCalls,
        cards: payload.cards,
        needsSignIn: payload.needsSignIn,
      };
    }),
  };
}
