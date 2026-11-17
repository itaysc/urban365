import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { VISITOR_COOKIE, VisitorService, setVisitorCookie } from '../visitor/visitor.service.js';
import { AgentCatalog } from './agent-catalog.js';
import { AgentRuntime } from './core/agent-runtime.js';
import type { AgentAccess, AgentContext } from './core/agent.types.js';
import { ConversationStore, transcriptView } from './core/conversation.store.js';

class ChatDto {
  @IsString() @MinLength(1) @MaxLength(2000) message!: string;
  @IsOptional() @IsString() @MaxLength(40) conversationId?: string;
}

/**
 * One route for every assistant. Which one is the `:agentId`, and what it may do
 * is the catalog's. The stream is server-sent events: text as it arrives, then the
 * cards a tool produced.
 */
@Public()
@Controller('agents')
export class AgentsController {
  private readonly isProduction: boolean;

  constructor(
    private readonly catalog: AgentCatalog,
    private readonly runtime: AgentRuntime,
    private readonly store: ConversationStore,
    private readonly visitors: VisitorService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('app.nodeEnv') === 'production';
  }

  @Get(':agentId/conversations/:id')
  async conversation(
    @Param('agentId') agentId: string,
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() principal?: Principal,
  ) {
    const agent = this.catalog.get(agentId);
    this.assertAccess(agent.id, principal);
    const caller = await this.caller(agent.id, this.runtime.access(agent), req, res, principal);
    const transcript = await this.store.open(
      {
        agentId,
        userId: caller.principal?.userId ?? null,
        visitorId: caller.visitorId,
        agencyId: caller.agencyId ?? null,
      },
      id,
    );
    return { id: transcript.id, messages: transcriptView(transcript.messages) };
  }

  @Delete(':agentId/conversations')
  async clear(
    @Param('agentId') agentId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() principal?: Principal,
  ) {
    const agent = this.catalog.get(agentId);
    this.assertAccess(agent.id, principal);
    const caller = await this.caller(agent.id, this.runtime.access(agent), req, res, principal);
    await this.store.clear({
      agentId,
      userId: caller.principal?.userId ?? null,
      visitorId: caller.visitorId ?? null,
      agencyId: caller.agencyId ?? null,
    });
    return { cleared: true };
  }

  @Post(':agentId/chat')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async chat(
    @Param('agentId') agentId: string,
    @Body() body: ChatDto,
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() principal?: Principal,
  ) {
    const agent = this.catalog.get(agentId);
    this.assertAccess(agent.id, principal);
    const caller = await this.caller(agent.id, this.runtime.access(agent), req, res, principal);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.runtime.chat(agent, caller, body.message, body.conversationId)) {
        res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'משהו השתבש. נסה שוב.' })}\n\n`);
    } finally {
      res.end();
    }
  }

  private assertAccess(agentId: string, principal: Principal | undefined): void {
    const agent = this.catalog.get(agentId);
    const access = this.runtime.access(agent);

    if (access === 'agency-member') {
      if (!principal) throw new UnauthorizedException('נדרשת התחברות.');
      if (!principal.agencyId) {
        throw new ForbiddenException('החשבון עדיין לא משויך לסוכנות מאושרת.');
      }
      return;
    }

    if (access === 'signed-in' && !principal) {
      throw new UnauthorizedException('נדרשת התחברות.');
    }
  }

  /**
   * A signed-in user, or the browser we have already named. The CRM assistant never
   * gets a visitor cookie: it is for an agency member only.
   */
  private async caller(
    agentId: string,
    access: AgentAccess,
    req: Request,
    res: Response,
    principal: Principal | undefined,
  ): Promise<AgentContext> {
    if (access === 'agency-member') {
      return {
        agentId,
        principal: principal ?? null,
        visitorId: null,
        agencyId: principal?.agencyId ?? null,
      };
    }

    if (principal) {
      return {
        agentId,
        principal,
        visitorId: await this.visitorId(req),
        agencyId: null,
      };
    }

    const existing = (req.cookies as Record<string, string> | undefined)?.[VISITOR_COOKIE];
    const known = await this.visitors.existing(existing);
    if (known) return { agentId, principal: null, visitorId: known.visitorId, agencyId: null };

    const created = await this.visitors.create();
    setVisitorCookie(res, created.visitorId, this.isProduction);
    return { agentId, principal: null, visitorId: created.visitorId, agencyId: null };
  }

  private async visitorId(req: Request): Promise<string | null> {
    const existing = (req.cookies as Record<string, string> | undefined)?.[VISITOR_COOKIE];
    const known = await this.visitors.existing(existing);
    return known?.visitorId ?? null;
  }
}
