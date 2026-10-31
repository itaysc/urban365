import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const MEETING_STATUSES = ['scheduled', 'done', 'cancelled'] as const;
export type MeetingStatusValue = (typeof MEETING_STATUSES)[number];

export class CreateMeetingDto {
  @IsString() @MaxLength(200) title!: string;

  /** ISO 8601 with an offset — what the browser's clock means, not a wall time. */
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;

  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() listingId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsIn(MEETING_STATUSES) status?: MeetingStatusValue;
}

/** Every field optional: moving a meeting by half an hour should not restate it. */
export class UpdateMeetingDto extends CreateMeetingDto {
  @IsOptional() @IsString() @MaxLength(200) declare title: string;
  @IsOptional() @IsDateString() declare startsAt: string;
  @IsOptional() @IsDateString() declare endsAt: string;
}

export const VIEWING_OUTCOMES = ['interested', 'thinking', 'not_interested', 'no_show'] as const;
export type ViewingOutcomeValue = (typeof VIEWING_OUTCOMES)[number];

/** What an agent writes down after a viewing. */
export class ViewingFeedbackDto {
  @IsIn(VIEWING_OUTCOMES) outcome!: ViewingOutcomeValue;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class ListMeetingsQuery {
  /** The window the calendar is showing. Both required: an unbounded diary is a scan. */
  @IsDateString() from!: string;
  @IsDateString() to!: string;

  @IsOptional() @IsString() customerId?: string;

  /**
   * Whose diary to show: a user id, or `'all'` for the whole agency's.
   *
   * Absent means the caller's own. Anything else is an owner's view of the team and is
   * refused to an agent — their colleagues' appointments are not theirs to read.
   */
  @IsOptional() @IsString() ownerId?: string;

  /** `'1'` for past meetings with no summary written yet, whatever the window says. */
  @IsOptional() @Type(() => String) @IsString() awaitingFeedback?: string;

  /** `'1'` to merge in the caller's **own** Google events, read-only. */
  @IsOptional() @Type(() => String) @IsString() google?: string;
}
