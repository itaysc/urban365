import { Module } from '@nestjs/common';
import { GoogleCalendarController, MeetingsController } from './calendar.controller.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { MeetingsService } from './meetings.service.js';

@Module({
  controllers: [MeetingsController, GoogleCalendarController],
  providers: [MeetingsService, GoogleCalendarService],
})
export class CalendarModule {}
