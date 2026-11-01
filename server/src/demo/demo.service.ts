import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { briefSummary } from '../cobrokerage/brief-summary.js';
import { CO_BROKERAGE, CUSTOMERS, LEADS, LISTINGS, MEETINGS } from './demo-data.js';

/** Counts, so the caller can say what happened rather than "done". */
export interface DemoSummary {
  customers: number;
  listings: number;
  leads: number;
  meetings: number;
  suggestions?: number;
  coBrokerage?: number;
}

/**
 * The order things must be deleted in, because of the foreign keys between them.
 *
 * Suggestions first — they point at everything else — then meetings, then leads, then
 * listings, then customers. Getting this wrong does not corrupt anything: Postgres
 * refuses the delete and the whole clear rolls back. It is written down so it is
 * obvious rather than discovered.
 */
const DELETE_ORDER = [
  'Suggestion',
  'CoBrokerageRequest',
  'Meeting',
  'Lead',
  'Listing',
  'Customer',
] as const;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/**
 * Filling an agency with something to look at, and emptying it again.
 *
 * Every record it creates is registered in `DemoRecord`, and the clear deletes exactly
 * those ids. Nothing is inferred from a name, a date or a flag on the row — an agency
 * running this against its own data must get its own data back untouched, and the only
 * way to promise that is to have written down what was added.
 *
 * On the owner client: this runs from a script with no session as often as from a
 * request, and it writes across five tables that the tenant role sees differently.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** What is already seeded, so the UI can offer the right button. */
  async status(agencyId: string): Promise<{ records: number }> {
    return { records: await this.prisma.demoRecord.count({ where: { agencyId } }) };
  }

  /**
   * Fills the agency.
   *
   * Not idempotent, deliberately: running it twice gives you twice the data, which is
   * occasionally what somebody wants and is always what they expect from a button
   * marked "add demo data". Clearing is how you get back to one copy.
   */
  async seed(agencyId: string, createdByUserId: string | null): Promise<DemoSummary> {
    const now = Date.now();
    const registered: { model: string; recordId: string }[] = [];
    const remember = (model: string, recordId: string) => registered.push({ model, recordId });

    // ── customers ────────────────────────────────────────────────────────────
    const customerIds: string[] = [];
    for (const customer of CUSTOMERS) {
      const row = await this.prisma.customer.create({
        data: {
          agencyId,
          name: customer.name,
          phone: customer.phone,
          email: customer.email ?? null,
          kind: customer.kind,
          notes: customer.notes ?? null,
          lookingSection: customer.lookingSection,
          lookingCities: customer.lookingCities ?? [],
          lookingTypes: customer.lookingTypes ?? [],
          minRooms: customer.minRooms,
          maxRooms: customer.maxRooms,
          minPrice: customer.minPrice,
          maxPrice: customer.maxPrice,
          minSquareMeter: customer.minSquareMeter,
        },
        select: { id: true },
      });
      customerIds.push(row.id);
      remember('Customer', row.id);
    }

    // ── listings ─────────────────────────────────────────────────────────────
    const listingIds: string[] = [];
    for (const listing of LISTINGS) {
      const publishedAt =
        listing.status === 'published'
          ? new Date(now - (listing.publishedDaysAgo ?? 3) * DAY)
          : null;

      const row = await this.prisma.listing.create({
        data: {
          agencyId,
          source: 'manual',
          status: listing.status,
          section: listing.section,
          city: listing.city,
          street: listing.street,
          houseNumber: listing.houseNumber,
          neighborhood: listing.neighborhood ?? null,
          propertyType: listing.propertyType,
          rooms: listing.rooms,
          price: listing.price,
          squareMeter: listing.squareMeter,
          pricePerSquareMeter: Math.round(listing.price / listing.squareMeter),
          floor: listing.floor,
          amenities: listing.amenities ?? [],
          description: listing.description ?? null,
          viewCount: listing.viewCount ?? 0,
          publishedAt,
          hasFullDetails: true,
          createdByUserId,
          sellerCustomerId:
            listing.sellerIndex !== undefined ? customerIds[listing.sellerIndex] : null,
        },
        select: { id: true },
      });
      listingIds.push(row.id);
      remember('Listing', row.id);
    }

    // ── leads ────────────────────────────────────────────────────────────────
    for (const lead of LEADS) {
      const row = await this.prisma.lead.create({
        data: {
          agencyId,
          name: lead.name,
          phone: lead.phone,
          email: lead.email ?? null,
          message: lead.message,
          status: lead.status,
          listingId: lead.listingIndex !== undefined ? listingIds[lead.listingIndex] : null,
        },
        select: { id: true },
      });
      remember('Lead', row.id);

      // `updatedAt` is Prisma's to set on write, so a lead that has been quiet for a
      // week has to be aged afterwards — and raw SQL, because the client would stamp
      // it again on any ordinary update.
      if (lead.quietDays > 0) {
        const quietSince = new Date(now - lead.quietDays * DAY);
        await this.prisma.$executeRaw`UPDATE "Lead" SET "updatedAt" = ${quietSince} WHERE id = ${row.id}`;
      }
    }

    // ── meetings ─────────────────────────────────────────────────────────────
    for (const meeting of MEETINGS) {
      const startsAt = new Date(now + meeting.inDays * DAY);
      const past = meeting.inDays < 0;

      const row = await this.prisma.meeting.create({
        data: {
          agencyId,
          title: meeting.title,
          startsAt,
          endsAt: new Date(startsAt.getTime() + meeting.durationMinutes * MINUTE),
          customerId: customerIds[meeting.customerIndex] ?? null,
          listingId:
            meeting.listingIndex !== undefined ? listingIds[meeting.listingIndex] : null,
          ownerId: createdByUserId,
          status: meeting.outcome ? 'done' : 'scheduled',
          attendeeResponse: meeting.attendeeResponse ?? 'pending',
          confirmationSentAt: meeting.asked ? new Date(startsAt.getTime() - 2 * DAY) : null,
          sellerResponse: meeting.sellerResponse ?? 'pending',
          sellerAskedAt: meeting.sellerAsked ? new Date(startsAt.getTime() - 2 * DAY) : null,
          outcome: meeting.outcome,
          feedbackNotes: meeting.feedbackNotes ?? null,
          feedbackAt: meeting.outcome ? new Date(startsAt.getTime() + DAY) : null,
          feedbackById: meeting.outcome ? createdByUserId : null,
          // A past viewing with no summary is the state the calendar chases, so it must
          // not be marked as reminded — otherwise half the demo never appears.
          reminderSentAt: past ? new Date(startsAt.getTime() - DAY) : null,
        },
        select: { id: true },
      });
      remember('Meeting', row.id);
    }

    const coBrokerage = await this.seedCoBrokerage(
      agencyId,
      customerIds,
      listingIds,
      createdByUserId,
      remember,
    );

    await this.prisma.demoRecord.createMany({
      data: registered.map((r) => ({ agencyId, ...r })),
      skipDuplicates: true,
    });

    this.logger.log(`Seeded ${registered.length} demo records for ${agencyId}.`);

    return {
      customers: CUSTOMERS.length,
      listings: LISTINGS.length,
      leads: LEADS.length,
      meetings: MEETINGS.length,
      coBrokerage,
    };
  }

  /**
   * Requests in both directions, with whichever other agency is actually there.
   *
   * Both directions, because the two sides look nothing alike — one carries our
   * customer's name, the other carries a brief and a stranger — and an agency that only
   * ever sees one of them has seen half the feature.
   *
   * Silently does nothing when there is no second agency to work with. That is the
   * normal state of a fresh database, and it is not a failure: the rest of the demo
   * data is still worth having, and `seed:dev-agency -- --slug two` is how you get the
   * other one.
   */
  private async seedCoBrokerage(
    agencyId: string,
    customerIds: string[],
    listingIds: string[],
    createdByUserId: string | null,
    remember: (model: string, recordId: string) => void,
  ): Promise<number> {
    const partner = await this.prisma.agency.findFirst({
      where: {
        id: { not: agencyId },
        status: 'active',
        coBrokerage: true,
        listings: { some: { status: 'published', delistedAt: null, source: 'manual' } },
      },
      select: {
        id: true,
        listings: {
          where: { status: 'published', delistedAt: null, source: 'manual' },
          select: { id: true },
          take: 10,
        },
        // For an incoming request, which belongs to them: a request with no buyer at
        // all would look right from our side and wrong from theirs, and the demo is
        // meant to be opened from both.
        customers: { where: { kind: { in: ['buyer', 'both'] } }, select: { id: true }, take: 10 },
      },
    });
    if (!partner) return 0;

    let made = 0;

    for (const [i, request] of CO_BROKERAGE.entries()) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerIds[request.customerIndex] },
        select: {
          id: true,
          lookingSection: true,
          lookingCities: true,
          lookingTypes: true,
          minRooms: true,
          maxRooms: true,
          minSquareMeter: true,
        },
      });
      if (!customer) continue;

      // Outgoing: their property, our customer. Incoming: our property, and a buyer of
      // theirs — a real one on their side, invisible on ours. The row always has a
      // buyer; what changes is who can see them.
      const outgoing = request.direction === 'out';
      const listingId = outgoing
        ? partner.listings[i % partner.listings.length]?.id
        : listingIds[request.listingIndex ?? 0];
      if (!listingId) continue;

      const theirCustomerId = partner.customers[i % Math.max(1, partner.customers.length)]?.id;
      if (!outgoing && !theirCustomerId) continue;

      const answered = request.status !== 'pending';

      try {
        const row = await this.prisma.coBrokerageRequest.create({
          data: {
            listingId,
            holdingAgencyId: outgoing ? partner.id : agencyId,
            seekingAgencyId: outgoing ? agencyId : partner.id,
            // Ours on the way out, theirs on the way in. Either way it is set — the
            // projection is what decides who sees it, and a demo with a null here would
            // be demonstrating a bug rather than the feature.
            customerId: outgoing ? customer.id : theirCustomerId,
            requestedById: outgoing ? createdByUserId : null,
            message: request.message,
            commissionSplit: request.commissionSplit,
            briefSummary: briefSummary(customer),
            status: request.status,
            respondedAt: answered ? new Date() : null,
          },
          select: { id: true },
        });
        remember('CoBrokerageRequest', row.id);
        made += 1;
      } catch {
        // The unique index on (listing, agency, customer). A second seed run into the
        // same pair is a duplicate, not a failure worth stopping the whole seed for.
        continue;
      }
    }

    return made;
  }

  /**
   * Empties it again — and only it.
   *
   * One transaction, so a foreign key this does not expect leaves the agency exactly as
   * it was rather than half cleared. The ids come from `DemoRecord` and nowhere else:
   * a customer somebody typed in by hand is not in that table and cannot be deleted by
   * this, whatever they called them.
   *
   * Suggestions are the exception worth naming. They are not registered, because the
   * sweep raises them on its own long after the seed has run — so they are deleted by
   * their *subject* being demo data, which is exactly the set that is about to stop
   * existing anyway.
   */
  async clear(agencyId: string): Promise<DemoSummary> {
    const records = await this.prisma.demoRecord.findMany({
      where: { agencyId },
      select: { model: true, recordId: true },
    });

    const idsOf = (model: string) =>
      records.filter((r) => r.model === model).map((r) => r.recordId);

    const counted: DemoSummary = {
      customers: 0,
      listings: 0,
      leads: 0,
      meetings: 0,
      suggestions: 0,
      coBrokerage: 0,
    };

    await this.prisma.$transaction(async (tx) => {
      const customerIds = idsOf('Customer');
      const listingIds = idsOf('Listing');

      const suggestions = await tx.suggestion.deleteMany({
        where: {
          agencyId,
          OR: [{ customerId: { in: customerIds } }, { listingId: { in: listingIds } }],
        },
      });
      counted.suggestions = suggestions.count;

      counted.coBrokerage = (
        await tx.coBrokerageRequest.deleteMany({
          where: {
            id: { in: idsOf('CoBrokerageRequest') },
            // Either side, because the seed makes them in both directions.
            OR: [{ seekingAgencyId: agencyId }, { holdingAgencyId: agencyId }],
          },
        })
      ).count;

      counted.meetings = (
        await tx.meeting.deleteMany({ where: { agencyId, id: { in: idsOf('Meeting') } } })
      ).count;
      counted.leads = (
        await tx.lead.deleteMany({ where: { agencyId, id: { in: idsOf('Lead') } } })
      ).count;
      counted.listings = (
        await tx.listing.deleteMany({ where: { agencyId, id: { in: listingIds } } })
      ).count;
      counted.customers = (
        await tx.customer.deleteMany({ where: { agencyId, id: { in: customerIds } } })
      ).count;

      await tx.demoRecord.deleteMany({ where: { agencyId } });
    });

    this.logger.log(
      `Cleared demo data for ${agencyId}: ${DELETE_ORDER.map(
        (m) => `${m}=${this.countFor(m, counted)}`,
      ).join(' ')}`,
    );

    return counted;
  }

  private countFor(model: (typeof DELETE_ORDER)[number], counted: DemoSummary): number {
    switch (model) {
      case 'Suggestion':
        return counted.suggestions ?? 0;
      case 'CoBrokerageRequest':
        return counted.coBrokerage ?? 0;
      case 'Meeting':
        return counted.meetings;
      case 'Lead':
        return counted.leads;
      case 'Listing':
        return counted.listings;
      case 'Customer':
        return counted.customers;
    }
  }
}
