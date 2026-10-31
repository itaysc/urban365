import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailConfig } from '../config/configuration.js';
import { MailService } from '../mail/mail.service.js';
import {
  sellerResponseTemplate,
  sellerViewingRequestTemplate,
  viewingConfirmationTemplate,
  viewingReminderTemplate,
  viewingResponseTemplate,
} from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf } from './address.js';

/** How far ahead of a viewing the reminder goes out. */
export const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * A reminder that is already late is not sent at all.
 *
 * If the sweep has been down for a day, waking up to send "your viewing is tomorrow"
 * about a viewing that happened this morning is worse than silence.
 */
const REMINDER_GRACE_MS = 60 * 60 * 1000;

const when = (at: Date) =>
  at.toLocaleString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });



/**
 * Asking a customer to confirm a viewing, and reminding them the day before.
 *
 * On the OWNER client throughout. Two of the three paths have no session at all — the
 * reminder sweep runs on a timer, and the customer answering has never signed in —
 * so there is no tenant context for row-level security to work from. Scoping is this
 * service's own: by meeting id for the agency-facing call, and by an unguessable token
 * for the public one.
 */
@Injectable()
export class ConfirmationsService {
  private readonly logger = new Logger(ConfirmationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = config.getOrThrow<MailConfig>('mail').appUrl.replace(/\/$/, '');
  }

  /**
   * Sends the confirmation request, issuing a token the customer can answer with.
   *
   * The token is minted once and kept: a reminder has to reach the same page, and a
   * customer who confirmed from the first email should not find that link dead.
   */
  async sendConfirmation(meetingId: string): Promise<{ sent: boolean; reason?: string }> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { customer: true, agency: { select: { name: true } } },
    });
    if (!meeting) throw new NotFoundException('הפגישה לא נמצאה.');

    if (!meeting.customer) {
      throw new BadRequestException('אין לקוח משויך לפגישה, אז אין למי לשלוח.');
    }
    if (!meeting.customer.email) {
      // Said plainly rather than failing silently: most customers are a phone number,
      // and the agent needs to know this one has to be rung instead.
      return { sent: false, reason: 'ללא כתובת אימייל — צריך לאשר בטלפון.' };
    }

    const token = meeting.confirmationToken ?? randomBytes(24).toString('base64url');

    const sent = await this.mail.send({
      to: meeting.customer.email,
      ...viewingConfirmationTemplate({
        firstName: meeting.customer.name.split(' ')[0],
        agencyName: meeting.agency.name,
        when: when(meeting.startsAt),
        location: meeting.location,
        confirmUrl: `${this.appUrl}/viewing/${token}`,
      }),
    });

    // The token is kept either way: the address may be wrong rather than the link, and
    // an agent who reads it out over the phone should find it works.
    await this.prisma.meeting.update({
      where: { id: meeting.id },
      data: { confirmationToken: token, ...(sent ? { confirmationSentAt: new Date() } : {}) },
    });

    if (!sent) {
      // Told plainly rather than reported as success. An agent who thinks the customer
      // was asked will wait for an answer that is never coming.
      return { sent: false, reason: 'שליחת האימייל נכשלה. כדאי לאשר בטלפון.' };
    }

    return { sent: true };
  }

  /** What the public page shows: a time, a place, a first name. Nothing else. */
  async byToken(token: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { confirmationToken: token },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        location: true,
        status: true,
        attendeeResponse: true,
        agency: { select: { name: true, phone: true } },
        customer: { select: { name: true } },
      },
    });
    if (!meeting) throw new NotFoundException('הקישור אינו תקף.');

    return {
      title: meeting.title,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      location: meeting.location,
      cancelled: meeting.status === 'cancelled',
      response: meeting.attendeeResponse,
      agencyName: meeting.agency.name,
      agencyPhone: meeting.agency.phone,
      firstName: meeting.customer?.name.split(' ')[0] ?? null,
    };
  }

  /**
   * The customer's answer.
   *
   * Idempotent, and changeable: somebody who confirms and then cannot make it should be
   * able to say so with the same link rather than having to ring.
   */
  async respond(token: string, confirmed: boolean) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { confirmationToken: token },
      include: {
        customer: { select: { name: true } },
        owner: { select: { email: true } },
      },
    });
    if (!meeting) throw new NotFoundException('הקישור אינו תקף.');

    await this.prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        attendeeResponse: confirmed ? 'confirmed' : 'declined',
        attendeeRespondedAt: new Date(),
      },
    });

    // The agent's diary just changed, so the agent is told. Not awaited into the
    // response: the customer's answer is recorded either way.
    if (meeting.owner?.email) {
      void this.mail
        .send({
          to: meeting.owner.email,
          ...viewingResponseTemplate({
            customerName: meeting.customer?.name ?? 'הלקוח',
            confirmed,
            when: when(meeting.startsAt),
            appUrl: this.appUrl,
          }),
        })
        .catch((error: Error) => this.logger.warn(`Could not notify the agent: ${error.message}`));
    }

    return { response: confirmed ? 'confirmed' : 'declined' };
  }


  // ── the seller's side ───────────────────────────────────────────────────────

  /**
   * Asks whoever owns the property whether the proposed time suits.
   *
   * The recipient is found two ways, because a property reaches this platform two ways:
   * an agency listing points at a record in the agency's own CRM, and a private
   * seller's listing points at their account. Neither is guaranteed, and the reasons
   * are told apart rather than collapsed into "could not send" — "nobody has said who
   * owns this" and "they have no email address" call for different things from the
   * agent.
   */
  async askSeller(meetingId: string): Promise<{ sent: boolean; reason?: string }> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        agency: { select: { name: true } },
        listing: {
          select: {
            street: true,
            houseNumber: true,
            city: true,
            sellerCustomer: { select: { name: true, email: true } },
            owner: { select: { firstName: true, email: true } },
          },
        },
      },
    });
    if (!meeting) throw new NotFoundException('הפגישה לא נמצאה.');

    if (!meeting.listing) {
      throw new BadRequestException('אין נכס משויך לפגישה, אז אין את מי לשאול.');
    }

    const seller = meeting.listing.sellerCustomer
      ? {
          name: meeting.listing.sellerCustomer.name,
          email: meeting.listing.sellerCustomer.email,
        }
      : meeting.listing.owner
        ? { name: meeting.listing.owner.firstName, email: meeting.listing.owner.email }
        : null;

    if (!seller) {
      return { sent: false, reason: 'לא רשום בעל נכס לנכס הזה. אפשר לקשר לקוח בעמוד הנכס.' };
    }
    if (!seller.email) {
      return { sent: false, reason: 'לבעל הנכס אין כתובת אימייל — צריך לתאם בטלפון.' };
    }

    const token = meeting.sellerToken ?? randomBytes(24).toString('base64url');

    const sent = await this.mail.send({
      to: seller.email,
      ...sellerViewingRequestTemplate({
        firstName: seller.name.split(' ')[0],
        agencyName: meeting.agency.name,
        when: when(meeting.startsAt),
        propertyLabel: addressOf(meeting.listing),
        confirmUrl: `${this.appUrl}/viewing/seller/${token}`,
      }),
    });

    // Kept whether or not the mail got through, for the same reason as the buyer's: an
    // agent reading the link down the phone should find it works.
    await this.prisma.meeting.update({
      where: { id: meeting.id },
      data: { sellerToken: token, ...(sent ? { sellerAskedAt: new Date() } : {}) },
    });

    if (!sent) return { sent: false, reason: 'שליחת האימייל נכשלה. כדאי לתאם בטלפון.' };
    return { sent: true };
  }

  /**
   * What the seller's page shows.
   *
   * Their own property's address, which they know, and the time. Not the buyer's name:
   * the seller has no use for it before the viewing, and a link that leaks who is
   * coming to see a flat is a link worth guessing at.
   */
  async sellerByToken(token: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { sellerToken: token },
      select: {
        startsAt: true,
        endsAt: true,
        status: true,
        sellerResponse: true,
        sellerNote: true,
        agency: { select: { name: true, phone: true } },
        listing: {
          select: {
            street: true,
            houseNumber: true,
            city: true,
            sellerCustomer: { select: { name: true } },
            owner: { select: { firstName: true } },
          },
        },
      },
    });
    if (!meeting) throw new NotFoundException('הקישור אינו תקף.');

    const name =
      meeting.listing?.sellerCustomer?.name ?? meeting.listing?.owner?.firstName ?? null;

    return {
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      cancelled: meeting.status === 'cancelled',
      response: meeting.sellerResponse,
      note: meeting.sellerNote,
      address: meeting.listing ? addressOf(meeting.listing) : null,
      agencyName: meeting.agency.name,
      agencyPhone: meeting.agency.phone,
      firstName: name ? name.split(' ')[0] : null,
    };
  }

  /**
   * The seller's answer, and whatever they wrote with it.
   *
   * The note is kept on a yes as well as a no — "the gate code is 1234" is worth as
   * much to the agent as "not before five".
   */
  async sellerRespond(token: string, confirmed: boolean, note?: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { sellerToken: token },
      include: {
        owner: { select: { email: true } },
        listing: {
          select: {
            sellerCustomer: { select: { name: true } },
            owner: { select: { firstName: true } },
          },
        },
      },
    });
    if (!meeting) throw new NotFoundException('הקישור אינו תקף.');

    const trimmed = note?.trim() ?? '';

    await this.prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        sellerResponse: confirmed ? 'confirmed' : 'declined',
        sellerRespondedAt: new Date(),
        // An empty box clears what was there: somebody correcting themselves should not
        // leave the old reason standing next to the new answer.
        sellerNote: trimmed === '' ? null : trimmed,
      },
    });

    if (meeting.owner?.email) {
      void this.mail
        .send({
          to: meeting.owner.email,
          ...sellerResponseTemplate({
            sellerName:
              meeting.listing?.sellerCustomer?.name ??
              meeting.listing?.owner?.firstName ??
              'בעל הנכס',
            confirmed,
            when: when(meeting.startsAt),
            note: trimmed === '' ? null : trimmed,
            appUrl: this.appUrl,
          }),
        })
        .catch((error: Error) => this.logger.warn(`Could not notify the agent: ${error.message}`));
    }

    return { response: confirmed ? 'confirmed' : 'declined' };
  }

  /**
   * Every reminder now due, sent once.
   *
   * `reminderSentAt` is both the record and the lock, and it is claimed before the mail
   * goes out rather than after: two instances sweeping at the same second would
   * otherwise both read the same row as unsent and both send. The claim is an
   * `updateMany` filtered on `reminderSentAt: null`, so exactly one of them gets a
   * count of 1 and the other gets 0 and moves on.
   *
   * A send that then fails releases the claim, so the next sweep tries again.
   */
  async sendDueReminders(now = new Date()): Promise<{ sent: number }> {
    const due = await this.prisma.meeting.findMany({
      where: {
        status: 'scheduled',
        reminderSentAt: null,
        // Inside the lead time, and not already past by more than the grace.
        startsAt: {
          lte: new Date(now.getTime() + REMINDER_LEAD_MS),
          gte: new Date(now.getTime() - REMINDER_GRACE_MS),
        },
        // Somebody who has already said no does not need reminding.
        attendeeResponse: { not: 'declined' },
        customer: { email: { not: null } },
      },
      include: { customer: true, agency: { select: { name: true } } },
      take: 100,
    });

    let sent = 0;

    for (const meeting of due) {
      if (!meeting.customer?.email) continue;

      const token = meeting.confirmationToken ?? randomBytes(24).toString('base64url');

      const claimed = await this.prisma.meeting.updateMany({
        where: { id: meeting.id, reminderSentAt: null },
        data: { reminderSentAt: new Date(), confirmationToken: token },
      });
      if (claimed.count === 0) continue;

      try {
        const ok = await this.mail.send({
          to: meeting.customer.email,
          ...viewingReminderTemplate({
            firstName: meeting.customer.name.split(' ')[0],
            agencyName: meeting.agency.name,
            when: when(meeting.startsAt),
            location: meeting.location,
            confirmUrl: `${this.appUrl}/viewing/${token}`,
          }),
        });
        if (!ok) throw new Error('the mailer refused it');
        sent += 1;
      } catch (error) {
        // One address that bounces must not stop the rest of the sweep — and the claim
        // goes back, so the next one tries this meeting again.
        this.logger.error(`Reminder for ${meeting.id} failed: ${(error as Error).message}`);
        await this.prisma.meeting
          .update({ where: { id: meeting.id }, data: { reminderSentAt: null } })
          .catch(() => undefined);
      }
    }

    if (sent > 0) this.logger.log(`Sent ${sent} viewing reminders.`);
    return { sent };
  }
}
