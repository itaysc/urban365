import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { isoMonth, isoWeek } from './period.js';

/** A thing one rule noticed, before it is anything in the database. */
export interface Raised {
  kind: Prisma.SuggestionCreateManyInput['kind'];
  dedupeKey: string;
  ownerId: string | null;
  score: number;
  reason: string;
  customerId?: string;
  listingId?: string;
  leadId?: string;
  meetingId?: string;
}

/** How many of any one kind a single sweep will raise for one agency. */
const PER_KIND_LIMIT = 10;

/** A viewing this close with nobody's answer is worth a phone call today. */
const VIEWING_HORIZON_MS = 72 * 60 * 60 * 1000;

/** An enquiry left this long has gone cold, whatever the agent meant to do. */
const LEAD_QUIET_DAYS = 3;

/** How long a listing has to have been up before silence means anything. */
const LISTING_PATIENCE_DAYS = 21;

/** And how many people have to have looked at it without asking a single question. */
const LISTING_VIEWS_THRESHOLD = 25;

const days = (n: number) => n * 24 * 60 * 60 * 1000;

/**
 * The rules that are not matching.
 *
 * Each one answers a question an agent would ask themselves on a good day and forget on
 * a busy one: is tomorrow's viewing actually happening, who enquired last week and never
 * heard back, which of our listings is nobody asking about.
 *
 * All of them are plain queries. The radar's worth rests on every row being true, and a
 * row that merely sounds plausible is worse than an empty page — so nothing here is
 * generated, estimated or ranked by a model.
 *
 * On the OWNER client, like the matching sweep and for the same reason: there is no
 * session on a timer. Every query names the agency it is working on.
 */
@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async all(agencyId: string, now = new Date()): Promise<Raised[]> {
    const [viewings, leads, listings] = await Promise.all([
      this.unansweredViewings(agencyId, now),
      this.quietLeads(agencyId, now),
      this.listingsNobodyAsksAbout(agencyId, now),
    ]);

    return [...viewings, ...leads, ...listings];
  }

  /**
   * A viewing in the next few days that somebody has not agreed to.
   *
   * Keyed on the meeting alone, with no period: a viewing happens once, and an agent
   * who waved this away has decided they will handle it. Raising it again tomorrow
   * would be nagging about a decision they already made.
   */
  private async unansweredViewings(agencyId: string, now: Date): Promise<Raised[]> {
    const meetings = await this.prisma.meeting.findMany({
      where: {
        agencyId,
        status: 'scheduled',
        startsAt: { gte: now, lte: new Date(now.getTime() + VIEWING_HORIZON_MS) },
        OR: [
          // The buyer was asked and has not answered. Never asked is not the same
          // thing: that is the agent's own choice, and some of them ring instead.
          { attendeeResponse: 'pending', confirmationSentAt: { not: null } },
          { attendeeResponse: 'declined' },
          // The owner of the property, same rule.
          { sellerResponse: 'pending', sellerAskedAt: { not: null } },
          { sellerResponse: 'declined' },
        ],
      },
      select: {
        id: true,
        ownerId: true,
        customerId: true,
        listingId: true,
        startsAt: true,
        attendeeResponse: true,
        confirmationSentAt: true,
        sellerResponse: true,
        sellerAskedAt: true,
      },
      orderBy: { startsAt: 'asc' },
      take: PER_KIND_LIMIT,
    });

    return meetings.map((meeting) => {
      const hours = Math.round((meeting.startsAt.getTime() - now.getTime()) / 3_600_000);

      /*
       * Which side, in the agent's words, because "unconfirmed" does not say who to
       * ring. Both can be true at once and both are worth saying.
       *
       * Only a side that was actually asked. The same `pending` sits in the column
       * whether somebody was asked and stayed quiet or was never asked at all, and
       * reporting the second as "has not approved" tells an agent to chase a person
       * who has never heard from them — which is both wrong and embarrassing to act
       * on. A side nobody asked is simply not mentioned.
       */
      const waiting: string[] = [];

      if (meeting.attendeeResponse === 'declined') waiting.push('הלקוח ביטל');
      else if (meeting.confirmationSentAt) waiting.push('הלקוח לא אישר');

      if (meeting.sellerResponse === 'declined') waiting.push('בעל הנכס דחה');
      else if (meeting.sellerAskedAt) waiting.push('בעל הנכס לא אישר');

      return {
        kind: 'viewing_unanswered' as const,
        dedupeKey: `${agencyId}:viewing_unanswered:${meeting.id}`,
        ownerId: meeting.ownerId,
        customerId: meeting.customerId ?? undefined,
        listingId: meeting.listingId ?? undefined,
        meetingId: meeting.id,
        // The nearer it is, the less time there is to fix it.
        score: hours <= 24 ? 100 : hours <= 48 ? 85 : 70,
        reason: `ביקור בעוד ${hours} שעות · ${waiting.join(' · ')}`,
      };
    });
  }

  /**
   * An enquiry nobody has touched.
   *
   * `updatedAt` rather than `createdAt`, so an agent who rang yesterday and wrote a note
   * is not chased about it today. Only the two statuses that mean the conversation has
   * not really started — a lead at `offer` is slow for reasons the radar cannot see.
   */
  private async quietLeads(agencyId: string, now: Date): Promise<Raised[]> {
    const quiet = new Date(now.getTime() - days(LEAD_QUIET_DAYS));

    const leads = await this.prisma.lead.findMany({
      where: { agencyId, status: { in: ['new', 'contacted'] }, updatedAt: { lt: quiet } },
      select: { id: true, name: true, assignedToId: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: PER_KIND_LIMIT,
    });

    return leads.map((lead) => {
      const quietDays = Math.floor((now.getTime() - lead.updatedAt.getTime()) / days(1));

      return {
        kind: 'stale_lead' as const,
        // Weekly, because a lead can go quiet more than once in its life and an agent
        // who passed on it in March should still hear about it in September.
        dedupeKey: `${agencyId}:stale_lead:${lead.id}:${isoWeek(now)}`,
        ownerId: lead.assignedToId,
        leadId: lead.id,
        score: quietDays >= 14 ? 100 : quietDays >= 7 ? 85 : 70,
        reason:
          lead.status === 'new'
            ? `פנייה שלא טופלה כבר ${quietDays} ימים`
            : `אין עדכון כבר ${quietDays} ימים`,
      };
    });
  }

  /**
   * A listing people look at and nobody asks about.
   *
   * Two conditions, because either alone says nothing: a listing up for a month with
   * four views has a visibility problem, and one with two hundred views in its first
   * week is doing fine. Views without a single enquiry, over weeks, is the shape of a
   * price or a photograph that is wrong — which is a conversation with the seller, and
   * the reason says so rather than pretending to know which.
   */
  private async listingsNobodyAsksAbout(agencyId: string, now: Date): Promise<Raised[]> {
    const patient = new Date(now.getTime() - days(LISTING_PATIENCE_DAYS));

    const listings = await this.prisma.listing.findMany({
      where: {
        agencyId,
        status: 'published',
        delistedAt: null,
        publishedAt: { lt: patient },
        viewCount: { gte: LISTING_VIEWS_THRESHOLD },
        leads: { none: {} },
      },
      select: { id: true, viewCount: true, publishedAt: true },
      orderBy: { viewCount: 'desc' },
      take: PER_KIND_LIMIT,
    });

    return listings.map((listing) => {
      const upFor = listing.publishedAt
        ? Math.floor((now.getTime() - listing.publishedAt.getTime()) / days(1))
        : LISTING_PATIENCE_DAYS;

      return {
        kind: 'listing_no_interest' as const,
        // Monthly. A listing that is not working is still not working next week, and
        // saying so every week is how an agent learns to ignore the page.
        dedupeKey: `${agencyId}:listing_no_interest:${listing.id}:${isoMonth(now)}`,
        ownerId: null,
        listingId: listing.id,
        // More people looking and still not asking is stronger evidence, not weaker.
        score: Math.min(90, 60 + Math.floor(listing.viewCount / LISTING_VIEWS_THRESHOLD) * 10),
        reason: `${listing.viewCount} צפיות ואף פנייה, ${upFor} ימים באוויר`,
      };
    });
  }
}
