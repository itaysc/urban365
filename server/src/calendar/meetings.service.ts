import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { can } from '../auth/permissions.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import type {
  CreateMeetingDto,
  ListMeetingsQuery,
  UpdateMeetingDto,
  ViewingFeedbackDto,
} from './dto/meeting.dto.js';

const SELECT = {
  id: true,
  title: true,
  startsAt: true,
  endsAt: true,
  location: true,
  notes: true,
  status: true,
  outcome: true,
  feedbackNotes: true,
  followUpAt: true,
  followUpDoneAt: true,
  feedbackAt: true,
  attendeeResponse: true,
  attendeeRespondedAt: true,
  confirmationSentAt: true,
  reminderSentAt: true,
  sellerResponse: true,
  sellerRespondedAt: true,
  sellerNote: true,
  sellerAskedAt: true,
  customerId: true,
  listingId: true,
  ownerId: true,
  googleEventId: true,
  customer: { select: { id: true, name: true, phone: true } },
  // `sellerCustomer` is here as a name, not as a contact: the calendar needs to say
  // whether there is anybody to ask about this property, and who. The phone and the
  // address live on the customer's own page.
  listing: {
    select: {
      id: true,
      city: true,
      street: true,
      houseNumber: true,
      sellerCustomer: { select: { id: true, name: true, phone: true } },
      ownerUserId: true,
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.MeetingSelect;

/**
 * The agency's diary.
 *
 * An agent sees their own appointments. An owner may ask for one agent's or for the
 * whole team's — `lead:read-all`, the same permission that decides whether somebody
 * sees every enquiry or only the ones assigned to them.
 *
 * What an owner never sees is anybody's **private** calendar. Google events are fetched
 * with the caller's own refresh token and belong to the caller alone; there is no code
 * path that reads another user's. Only meetings booked here cross between people.
 */
@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
    private readonly google: GoogleCalendarService,
  ) {}

  private assertCanWrite(): void {
    // Same bar as leads and customers: anybody working the pipeline books viewings.
    if (!can(this.context.getPrincipal(), 'lead:write')) {
      throw new ForbiddenException('אין לך הרשאה לערוך פגישות.');
    }
  }

  /**
   * Everything in a window, plus — when asked — the caller's own Google events beside
   * it. Google events are read-only here and carry no id of ours, so the client can
   * tell them apart without being told.
   */
  async list(query: ListMeetingsQuery) {
    const agencyId = this.context.requireAgencyId();
    const from = new Date(query.from);
    const to = new Date(query.to);

    if (to <= from) throw new BadRequestException('טווח התאריכים אינו תקין.');

    const where: Prisma.MeetingWhereInput = {
      agencyId,
      // Overlapping the window rather than starting in it: a meeting that began before
      // the window and runs into it is still on that day's calendar.
      startsAt: { lt: to },
      endsAt: { gt: from },
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...this.whoseDiary(query.ownerId),
    };

    const items = await this.prisma.client.meeting.findMany({
      where,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      select: SELECT,
    });

    const googleEvents =
      query.google === '1' ? await this.google.events(this.userId(), from, to) : [];

    return { items, googleEvents };
  }

  /**
   * Which diary the caller is allowed to be looking at.
   *
   * Unassigned meetings come back for everybody: one booked for the agency rather than
   * for a person is the agency's to see, and hiding it from all of them would mean
   * nobody turns up.
   */
  private whoseDiary(ownerId: string | undefined): Prisma.MeetingWhereInput {
    const me = this.userId();

    if (!ownerId) return { OR: [{ ownerId: me }, { ownerId: null }] };

    if (!can(this.context.getPrincipal(), 'lead:read-all')) {
      throw new ForbiddenException('רק בעלים של הסוכנות יכול לראות את היומנים של הצוות.');
    }

    return ownerId === 'all' ? {} : { ownerId };
  }

  /**
   * Everybody who has been to see one property.
   *
   * Not windowed, unlike the calendar: the question is "who has seen this flat", and
   * the answer is the whole history of it. Newest first, because the last viewing is
   * what an owner asking "any interest?" wants to hear about.
   */
  async forListing(listingId: string) {
    const agencyId = this.context.requireAgencyId();

    return this.prisma.client.meeting.findMany({
      // No `whoseDiary` here: a property's history belongs to the agency, not to
      // whichever agent happened to hold the keys that day. An owner ringing to ask
      // how the viewings went should get an answer from anybody who picks up.
      where: { agencyId, listingId },
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: SELECT,
    });
  }

  /**
   * Everywhere one customer has been taken.
   *
   * The mirror of `forListing`, and the agency's for the same reason: whoever picks up
   * the phone to this person should be able to see what they have already been shown,
   * rather than offering them the flat they turned down last week.
   */
  async forCustomer(customerId: string) {
    const agencyId = this.context.requireAgencyId();

    return this.prisma.client.meeting.findMany({
      where: { agencyId, customerId },
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: SELECT,
    });
  }

  /**
   * Past viewings nobody has written up yet.
   *
   * Its own call rather than a flag on the month: what an agent needs chasing about is
   * last week's viewing, which is not on screen when they are looking at next month.
   * Capped and oldest first — the one that has been waiting longest is the one most
   * likely to be forgotten.
   */
  async awaitingFeedback() {
    const agencyId = this.context.requireAgencyId();

    return this.prisma.client.meeting.findMany({
      where: {
        agencyId,
        status: 'scheduled',
        outcome: null,
        endsAt: { lt: new Date() },
        ...this.whoseDiary(undefined),
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: 20,
      select: SELECT,
    });
  }

  /**
   * Writing up a viewing, which also closes it: an agent who has said how it went has
   * said that it happened, and asking them to mark it done as well is a second click
   * for something already known.
   *
   * A no-show is `done` too. The meeting is over either way — leaving it `scheduled`
   * would keep it on the chase list for ever.
   */
  async recordFeedback(id: string, dto: ViewingFeedbackDto) {
    this.assertCanWrite();
    await this.require(id);

    return this.prisma.client.meeting.update({
      where: { id },
      data: {
        outcome: dto.outcome,
        feedbackNotes: dto.notes?.trim() || null,
        feedbackAt: new Date(),
        feedbackById: this.userId(),
        status: 'done',
        // Rewritten each time the summary is: changing the outcome from "thinking" to
        // "not interested" should not leave a chase behind for somebody who said no.
        followUpAt: dto.followUpInDays ? this.inDays(dto.followUpInDays) : null,
        followUpDoneAt: null,
      },
      select: SELECT,
    });
  }

  /**
   * Everything somebody is supposed to go back to, due now or overdue.
   *
   * The agent's own, like the calendar — a chase is a thing a person does, and a list
   * of everybody's is a list nobody works. Oldest first: the one that has been waiting
   * longest is the one going cold.
   */
  async followUps() {
    const agencyId = this.context.requireAgencyId();

    return this.prisma.client.meeting.findMany({
      where: {
        agencyId,
        followUpAt: { not: null, lte: new Date() },
        followUpDoneAt: null,
        ...this.whoseDiary(undefined),
      },
      orderBy: [{ followUpAt: 'asc' }, { id: 'asc' }],
      take: 20,
      select: SELECT,
    });
  }

  /** Marking a chase done. Not deleting it: what happened is part of the history. */
  async completeFollowUp(id: string) {
    this.assertCanWrite();
    await this.require(id);

    return this.prisma.client.meeting.update({
      where: { id },
      data: { followUpDoneAt: new Date() },
      select: SELECT,
    });
  }

  /** Midday, so a follow-up never lands at whatever minute the summary was written. */
  private inDays(days: number): Date {
    const at = new Date();
    at.setDate(at.getDate() + days);
    at.setHours(12, 0, 0, 0);
    return at;
  }

  async create(dto: CreateMeetingDto) {
    this.assertCanWrite();
    const agencyId = this.context.requireAgencyId();
    const { startsAt, endsAt } = this.window(dto.startsAt, dto.endsAt);

    const meeting = await this.prisma.client.meeting.create({
      data: {
        agencyId,
        title: dto.title.trim(),
        startsAt,
        endsAt,
        location: dto.location?.trim() || null,
        notes: dto.notes?.trim() || null,
        customerId: dto.customerId || null,
        listingId: dto.listingId || null,
        // Whoever booked it, unless they said otherwise. A diary entry with no owner
        // is one nobody looks at.
        ownerId: dto.ownerId || this.userId(),
        status: dto.status,
      },
      select: SELECT,
    });

    return this.withGoogle(meeting);
  }

  async update(id: string, dto: UpdateMeetingDto) {
    this.assertCanWrite();
    const existing = await this.require(id);

    const { startsAt, endsAt } = this.window(
      dto.startsAt ?? existing.startsAt.toISOString(),
      dto.endsAt ?? existing.endsAt.toISOString(),
    );

    const meeting = await this.prisma.client.meeting.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title.trim() } : {}),
        startsAt,
        endsAt,
        location: dto.location === undefined ? undefined : dto.location.trim() || null,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
        customerId: dto.customerId === undefined ? undefined : dto.customerId || null,
        listingId: dto.listingId === undefined ? undefined : dto.listingId || null,
        ownerId: dto.ownerId === undefined ? undefined : dto.ownerId || null,
        status: dto.status,
      },
      select: SELECT,
    });

    return this.withGoogle(meeting);
  }

  async remove(id: string) {
    this.assertCanWrite();
    const existing = await this.require(id);

    await this.prisma.client.meeting.delete({ where: { id } });

    // The copy goes too, or somebody's Google Calendar keeps an appointment that no
    // longer exists and they turn up to it.
    if (existing.googleEventId && existing.ownerId) {
      await this.google.remove(existing.ownerId, existing.googleEventId);
    }

    return { deleted: true };
  }

  /**
   * Pushes to the owner's Google Calendar if they have one connected, and remembers the
   * event id. Never throws: see the note on `GoogleCalendarService`.
   */
  private async withGoogle(meeting: Prisma.MeetingGetPayload<{ select: typeof SELECT }>) {
    if (!meeting.ownerId) return meeting;

    const googleEventId = await this.google.push(meeting.ownerId, {
      title: meeting.title,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      location: meeting.location,
      notes: meeting.notes,
      googleEventId: meeting.googleEventId,
    });

    if (googleEventId && googleEventId !== meeting.googleEventId) {
      await this.prisma.client.meeting.update({ where: { id: meeting.id }, data: { googleEventId } });
      return { ...meeting, googleEventId };
    }

    return meeting;
  }

  private window(startsAtRaw: string, endsAtRaw: string) {
    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('תאריך לא תקין.');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('שעת הסיום צריכה להיות אחרי שעת ההתחלה.');
    }

    return { startsAt, endsAt };
  }

  /** For routes that hand a meeting to a service with no tenant context of its own. */
  async assertOwn(id: string): Promise<void> {
    await this.require(id);
  }

  private async require(id: string) {
    const meeting = await this.prisma.client.meeting.findUnique({
      where: { id },
      select: { id: true, startsAt: true, endsAt: true, ownerId: true, googleEventId: true },
    });
    if (!meeting) throw new NotFoundException('הפגישה לא נמצאה.');
    return meeting;
  }

  private userId(): string {
    const principal = this.context.getPrincipal();
    if (!principal) throw new ForbiddenException('נדרשת התחברות.');
    return principal.userId;
  }
}
