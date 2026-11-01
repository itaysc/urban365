import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailConfig } from '../config/configuration.js';
import { MailService } from '../mail/mail.service.js';
import { savedSearchAlertTemplate, type AlertListing } from '../mail/templates.js';
import { israeliHour } from '../matching/briefing-time.js';
import { israeliDate } from '../matching/briefing-time.js';
import { matchBrief, type Brief, type Candidate } from '../matching/match.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** How many go in one email. More than this and nobody reads any of them. */
const PER_EMAIL = 6;

/** How many searches one sweep will look at. A ceiling, not a target. */
const PER_SWEEP = 500;

/**
 * The hours an alert may arrive.
 *
 * A property alert is worth sending promptly — good flats go quickly — but not at
 * three in the morning. Anything found overnight waits for the morning and goes out
 * with whatever else has appeared by then.
 */
const EARLIEST_HOUR = 8;
const LATEST_HOUR = 21;

/**
 * Telling a buyer when something they asked about appears.
 *
 * On the OWNER client: a timer has no session, and these rows belong to people rather
 * than to an agency, so there is no tenant to assume. Scoping is this service's own —
 * every query names the search it is working on.
 *
 * The matching is the same `matchBrief` the agency side uses on a customer's brief. It
 * has to be: a buyer who saves "4 rooms in Holon up to 2.4m" and an agent who writes
 * the same thing on a customer card are describing one thing, and two implementations
 * of it would disagree within a month.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = config.getOrThrow<MailConfig>('mail').appUrl.replace(/\/$/, '');
  }

  /**
   * Every alert with something new to say, sent once a day at most.
   *
   * `lastAlertAt` stops a second email the same day and `notifiedUpTo` is what "new"
   * is measured against — the two are different jobs. Using the first for both would
   * mean a failed send silently skipped every listing that appeared before it.
   */
  async sendDue(now = new Date()): Promise<{ sent: number }> {
    const hour = israeliHour(now);
    if (hour < EARLIEST_HOUR || hour > LATEST_HOUR) return { sent: 0 };

    const searches = await this.prisma.savedSearch.findMany({
      where: { alert: true, user: { disabledAt: null, emailVerifiedAt: { not: null } } },
      select: {
        id: true,
        name: true,
        section: true,
        cities: true,
        propertyTypes: true,
        minRooms: true,
        maxRooms: true,
        minPrice: true,
        maxPrice: true,
        minSquareMeter: true,
        lastAlertAt: true,
        notifiedUpTo: true,
        user: { select: { email: true, firstName: true } },
      },
      take: PER_SWEEP,
    });

    let sent = 0;

    for (const search of searches) {
      // One a day. Said in local dates rather than in hours, so a sweep running at
      // 08:05 and again at 20:05 does not count as two different days.
      if (search.lastAlertAt && israeliDate(search.lastAlertAt) === israeliDate(now)) continue;

      const { matches, newest } = await this.matchesFor(search);
      if (matches.length === 0) continue;

      // Claimed before the send and against the value we read, so two instances
      // sweeping at once cannot both write to the same person.
      const claimed = await this.prisma.savedSearch.updateMany({
        where: { id: search.id, lastAlertAt: search.lastAlertAt },
        data: { lastAlertAt: now, notifiedUpTo: newest },
      });
      if (claimed.count === 0) continue;

      try {
        const ok = await this.mail.send({
          to: search.user.email,
          ...savedSearchAlertTemplate({
            firstName: search.user.firstName,
            searchName: search.name,
            listings: matches.slice(0, PER_EMAIL),
            more: Math.max(0, matches.length - PER_EMAIL),
            appUrl: this.appUrl,
          }),
        });
        if (!ok) throw new Error('the mailer refused it');
        sent += 1;
      } catch (error) {
        this.logger.error(`Alert for ${search.id} failed: ${(error as Error).message}`);
        // Both go back: the day is released so it retries, and the watermark so the
        // listings it was about are still considered new next time.
        await this.prisma.savedSearch
          .update({
            where: { id: search.id },
            data: { lastAlertAt: search.lastAlertAt, notifiedUpTo: search.notifiedUpTo },
          })
          .catch(() => undefined);
      }
    }

    if (sent > 0) this.logger.log(`Sent ${sent} search alerts.`);
    return { sent };
  }

  /**
   * What has appeared since we last wrote, and fits.
   *
   * Published after the watermark, so a listing that existed when the search was saved
   * is not news — somebody who saves a search has just looked at the results.
   */
  private async matchesFor(search: {
    section: string | null;
    cities: string[];
    propertyTypes: string[];
    minRooms: number | null;
    maxRooms: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    minSquareMeter: number | null;
    notifiedUpTo: Date;
  }): Promise<{ matches: AlertListing[]; newest: Date }> {
    const listings = await this.prisma.listing.findMany({
      where: {
        status: 'published',
        delistedAt: null,
        publishedAt: { gt: search.notifiedUpTo },
      },
      select: {
        id: true,
        section: true,
        city: true,
        street: true,
        houseNumber: true,
        propertyType: true,
        rooms: true,
        price: true,
        squareMeter: true,
        publishedAt: true,
      },
      /*
       * Oldest first, and the watermark moves to the newest listing *scanned* rather
       * than the newest that matched.
       *
       * Newest-first with a cap would take the most recent two hundred and silently
       * skip everything older, which is exactly the backlog an alert exists to catch.
       * This way the window is bounded, nothing is skipped, and a search that is
       * behind simply catches up over the next few sweeps.
       */
      orderBy: { publishedAt: 'asc' },
      take: 200,
    });

    const brief: Brief = {
      lookingSection: search.section,
      lookingCities: search.cities,
      lookingTypes: search.propertyTypes,
      minRooms: search.minRooms,
      maxRooms: search.maxRooms,
      minPrice: search.minPrice,
      maxPrice: search.maxPrice,
      minSquareMeter: search.minSquareMeter,
    };

    const matches: AlertListing[] = [];
    let newest = search.notifiedUpTo;

    for (const listing of listings) {
      // Every listing moves the watermark, matching or not: this sweep has judged it,
      // and judging it again next hour is work that can only reach the same answer.
      if (listing.publishedAt && listing.publishedAt > newest) newest = listing.publishedAt;

      if (!matchBrief(brief, listing as Candidate)) continue;

      matches.push({
        address:
          [[listing.street, listing.houseNumber].filter(Boolean).join(' '), listing.city]
            .filter(Boolean)
            .join(', ') || 'נכס',
        rooms: listing.rooms,
        price: listing.price,
        squareMeter: listing.squareMeter,
      });
    }

    // Newest first for the email: scanning order is the sweep's business, and a person
    // reading an alert wants the one that just appeared at the top.
    return { matches: matches.reverse(), newest };
  }
}
