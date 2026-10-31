import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { MeetingsService } from './meetings.service.js';
import { CreateMeetingDto, ListMeetingsQuery, UpdateMeetingDto } from './dto/meeting.dto.js';

/** The agency's diary. */
@UseGuards(TenantGuard)
@Controller('my/meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  list(@Query() query: ListMeetingsQuery) {
    return this.meetings.list(query);
  }

  @Post()
  create(@Body() dto: CreateMeetingDto) {
    return this.meetings.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.meetings.remove(id);
  }
}

/**
 * Connecting a Google Calendar.
 *
 * Per user, not per agency: it is somebody's own calendar, and two agents at one agency
 * connect their own. No tenant guard on the callback — Google sends the browser there
 * with no idea what an agency is, and the session is what identifies the user.
 */
@Controller('my/calendar/google')
export class GoogleCalendarController {
  private readonly appUrl: string;

  constructor(
    private readonly google: GoogleCalendarService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('mail.appUrl') ?? '').replace(/\/$/, '');
  }

  @Get('status')
  status(@CurrentUser() principal: Principal) {
    return this.google.status(principal.userId);
  }

  @Get('connect')
  connect(@CurrentUser() principal: Principal, @Res() res: Response) {
    // The user id travels in `state` because the callback arrives as a top-level
    // navigation — no custom headers, and nothing else to key it on if the session
    // cookie is missing. It is checked against the session on the way back.
    res.redirect(this.google.authorizationUrl(principal.userId));
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @CurrentUser() principal: Principal,
    @Res() res: Response,
  ) {
    const back = `${this.appUrl}/app/calendar`;

    // Pressing cancel on Google's screen is not an error worth a message.
    if (!code) return res.redirect(back);

    // The state has to be this session's user. Without the check, a link could connect
    // an attacker's calendar to whoever happens to click it.
    if (state !== principal.userId) {
      return res.redirect(`${back}?googleError=${encodeURIComponent('החיבור לא תואם למשתמש המחובר.')}`);
    }

    try {
      await this.google.connect(principal.userId, code);
      return res.redirect(`${back}?googleConnected=1`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'החיבור ליומן נכשל.';
      return res.redirect(`${back}?googleError=${encodeURIComponent(message)}`);
    }
  }

  @Delete()
  async disconnect(@CurrentUser() principal: Principal) {
    await this.google.disconnect(principal.userId);
    return { connected: false };
  }
}
