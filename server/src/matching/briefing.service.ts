import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { MailConfig } from '../config/configuration.js';
import { MailService } from '../mail/mail.service.js';
import { dailyBriefingTemplate, type BriefingItem } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { briefingDue } from './briefing-time.js';

/** How many fit in an email somebody reads standing up. The rest are on the page. */
const ITEMS_IN_EMAIL = 5;

/** The same words the radar uses, so the email and the page are one thing. */
const KIND_HEADING: Record<string, string> = {
  viewing_unanswered: 'ביקור שלא אושר',
  new_match: 'התאמה ללקוח',
  stale_lead: 'פנייה שממתינה',
  listing_no_interest: 'נכס שאף אחד לא שואל עליו',
};

/** And the same order: a deadline this week outranks a match that keeps. */
const KIND_ORDER = ['viewing_unanswered', 'new_match', 'stale_lead', 'listing_no_interest'];

const SELECT = {
  id: true,
  kind: true,
  score: true,
  reason: true,
  customer: { select: { name: true } },
  lead: { select: { name: true } },
  listing: { select: { city: true, street: true, houseNumber: true, status: true, delistedAt: true } },
} satisfies Prisma.SuggestionSelect;

/**
 * The morning email of what is worth doing today.
 *
 * The radar has one failure mode and it is not accuracy: an agent starts the day in
 * WhatsApp and the inbox, so a page that waits to be visited goes stale and the work on
 * it is wasted. This is the part that goes to them.
 *
 * On the OWNER client — a timer has no session — so every query names the user it is
 * working on rather than leaning on row-level security.
 */
@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = config.getOrThrow<MailConfig>('mail').appUrl.replace(/\/$/, '');
  }

  /**
   * Everybody due one, sent once.
   *
   * `lastBriefingAt` is both the record and the lock, claimed before the mail goes out
   * rather than after: two instances sweeping at the same second would otherwise both
   * read the same row as unsent and both send. The claim is an `updateMany` filtered on
   * the value we read, so exactly one of them gets a count of 1.
   *
   * A send that then fails releases the claim, so the next sweep tries again — at worst
   * an hour later, still the same morning.
   */
  async sendDue(now = new Date()): Promise<{ sent: number }> {
    const candidates = await this.prisma.user.findMany({
      where: {
        dailyBriefing: true,
        disabledAt: null,
        emailVerifiedAt: { not: null },
        // Only people who work at an agency: the radar is an agency's.
        memberships: { some: { status: 'active' } },
      },
      select: { id: true, email: true, firstName: true, lastBriefingAt: true },
      take: 500,
    });

    let sent = 0;

    for (const user of candidates) {
      if (!briefingDue(now, user.lastBriefingAt)) continue;

      const { items, more } = await this.itemsFor(user.id);
      // Nothing to say is a reason not to write. A daily email that sometimes says
      // "nothing today" teaches people to stop opening it.
      if (items.length === 0) continue;

      const claimed = await this.prisma.user.updateMany({
        where: { id: user.id, lastBriefingAt: user.lastBriefingAt },
        data: { lastBriefingAt: now },
      });
      if (claimed.count === 0) continue;

      try {
        const ok = await this.mail.send({
          to: user.email,
          ...dailyBriefingTemplate({
            firstName: user.firstName,
            items,
            more,
            appUrl: this.appUrl,
          }),
        });
        if (!ok) throw new Error('the mailer refused it');
        sent += 1;
      } catch (error) {
        this.logger.error(`Briefing for ${user.id} failed: ${(error as Error).message}`);
        await this.prisma.user
          .update({ where: { id: user.id }, data: { lastBriefingAt: user.lastBriefingAt } })
          .catch(() => undefined);
      }
    }

    if (sent > 0) this.logger.log(`Sent ${sent} morning briefings.`);
    return { sent };
  }

  /**
   * What is on this person's radar, in the order the page would show it.
   *
   * The same filters as the page, deliberately: an email that lists something the page
   * will not show is an email that makes the product look broken. That includes the
   * archived-listing rule — a suggestion about a property the agency has stopped
   * selling is not a suggestion.
   */
  private async itemsFor(userId: string): Promise<{ items: BriefingItem[]; more: number }> {
    const open = await this.prisma.suggestion.findMany({
      where: {
        status: 'open',
        OR: [{ ownerId: userId }, { ownerId: null }],
        AND: [{ OR: [{ listingId: null }, { listing: { status: 'published', delistedAt: null } }] }],
        // Their agency's, by way of their own membership — the timer has no tenant.
        agency: { memberships: { some: { userId, status: 'active' } } },
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
      select: SELECT,
    });

    const ordered = [...open].sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
    );

    const items = ordered.slice(0, ITEMS_IN_EMAIL).map((row) => ({
      heading: KIND_HEADING[row.kind] ?? '',
      subject: this.subjectOf(row),
      reason: row.reason,
    }));

    return { items, more: Math.max(0, ordered.length - items.length) };
  }

  /** Who or what the row is about, in one line. */
  private subjectOf(row: { customer: { name: string } | null; lead: { name: string } | null; listing: { city: string | null; street: string | null; houseNumber: number | null } | null }): string {
    const person = row.customer?.name ?? row.lead?.name;
    if (person) return person;

    if (row.listing) {
      const street = [row.listing.street, row.listing.houseNumber].filter(Boolean).join(' ');
      return [street, row.listing.city].filter(Boolean).join(', ') || 'נכס';
    }

    return 'נכס';
  }
}
