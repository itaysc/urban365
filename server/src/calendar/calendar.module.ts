import { Module } from '@nestjs/common';
import { AgentExclude } from '../agents/core/agent-exclude.js';
import {
  GoogleCalendarController,
  MeetingsController,
  ViewingConfirmationController,
} from './calendar.controller.js';
import { ConfirmationsService } from './confirmations.service.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { MeetingsService } from './meetings.service.js';
import { ReminderScheduler } from './reminder.scheduler.js';

@AgentExclude()
@Module({
  controllers: [MeetingsController, GoogleCalendarController, ViewingConfirmationController],
  providers: [MeetingsService, GoogleCalendarService, ConfirmationsService, ReminderScheduler],
  exports: [MeetingsService],
})
export class CalendarModule {}
