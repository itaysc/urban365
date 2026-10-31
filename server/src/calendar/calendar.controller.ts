import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Throttle } from '@nestjs/throttler';
import { ConfirmationsService } from './confirmations.service.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { MeetingsService } from './meetings.service.js';
import {
  CreateMeetingDto,
  ListMeetingsQuery,
  UpdateMeetingDto,
  ViewingFeedbackDto,
} from './dto/meeting.dto.js';

/** The agency's diary. */
@UseGuards(TenantGuard)
@Controller('my/meetings')
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly confirmations: ConfirmationsService,
  ) {}

  @Get()
  list(@Query() query: ListMeetingsQuery) {
    return this.meetings.list(query);
  }

  /** Past viewings with no summary written. Declared before `:id` would matter if
   *  there were one on this controller; kept above anyway so it reads in order. */
  @Get('awaiting-feedback')
  awaitingFeedback() {
    return this.meetings.awaitingFeedback();
  }

  /** Who has been to see one property, newest first. */
  @Get('for-listing/:listingId')
  forListing(@Param('listingId') listingId: string) {
    return this.meetings.forListing(listingId);
  }

  /** Everywhere one customer has been taken, newest first. */
  @Get('for-customer/:customerId')
  forCustomer(@Param('customerId') customerId: string) {
    return this.meetings.forCustomer(customerId);
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

  /**
   * Ask the customer to confirm.
   *
   * Scoped by the tenant client first — `meetings.require` refuses a meeting that is
   * not this agency's — before the confirmation service, which runs as the owner and
   * has no agency of its own to check against.
   */
  /** How the viewing went. Writing it up is also what marks the meeting done. */
  @Post(':id/feedback')
  feedback(@Param('id') id: string, @Body() dto: ViewingFeedbackDto) {
    return this.meetings.recordFeedback(id, dto);
  }

  @Post(':id/confirmation')
  async sendConfirmation(@Param('id') id: string) {
    await this.meetings.assertOwn(id);
    return this.confirmations.sendConfirmation(id);
  }
}

/**
 * The page a customer lands on from the email.
 *
 * Public and unauthenticated: they have never signed in and never will. The token in
 * the path is the whole of the authorisation, which is why it is 24 random bytes and
 * why the page behind it shows a time, a place and a first name and nothing else.
 */
@Public()
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('viewings')
export class ViewingConfirmationController {
  constructor(private readonly confirmations: ConfirmationsService) {}

  @Get(':token')
  show(@Param('token') token: string) {
    return this.confirmations.byToken(token);
  }

  @Post(':token/confirm')
  confirm(@Param('token') token: string) {
    return this.confirmations.respond(token, true);
  }

  @Post(':token/decline')
  decline(@Param('token') token: string) {
    return this.confirmations.respond(token, false);
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
