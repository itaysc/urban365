import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { matchBrief, shortlistMatches, type Brief, type Candidate } from './match.js';
import { RulesService, type Raised } from './rules.service.js';

/**
 * How many suggestions one sweep will raise for one agency.
 *
 * A cap rather than a page: the point of the radar is the few things worth doing today,
 * and an agency that would produce four hundred matches has a brief problem, not a
 * matching problem. Raising four hundred rows would bury the ten that matter.
 */
const PER_AGENCY_LIMIT = 50;

/**
 * And how few across agencies.
 *
 * Deliberately meaner than the within-agency cap. A co-brokerage match costs an agent
 * a conversation with a stranger and half a commission, so three plausible ones are
 * worth more than thirty: the bar for "worth asking somebody else" is higher than for
 * "worth looking at", and the number is where that belief lives.
 */
const CO_BROKERAGE_LIMIT = 5;

/** Below this, a cross-agency introduction is not worth anybody's phone call. */
const CO_BROKERAGE_MIN_SCORE = 80;

/**
 * And how many for any one customer.
 *
 * Without this, one vague brief takes the whole agency's allowance: "anything in Holon"
 * matches every flat in Holon, and an agent opens the radar to forty rows about one
 * person and none about the other thirty. Three is enough to be worth acting on and few
 * enough that the next customer is still on the screen.
 */
const PER_CUSTOMER_LIMIT = 3;

const BRIEF_SELECT = {
  id: true,
  assignedToId: true,
  lookingSection: true,
  lookingCities: true,
  lookingTypes: true,
  minRooms: true,
  maxRooms: true,
  minPrice: true,
  maxPrice: true,
  minSquareMeter: true,
} as const;

const CANDIDATE_SELECT = {
  id: true,
  section: true,
  city: true,
  propertyType: true,
  rooms: true,
  price: true,
  squareMeter: true,
} as const;

interface FoundMatch {
  customerId: string;
  listingId: string;
  ownerId: string | null;
  score: number;
  reason: string;
}

/**
 * Matching an agency's customers against the property it is holding.
 *
 * On the OWNER client, because the sweep runs on a timer with no session and therefore
 * no tenant context for row-level security to work from. Scoping is this service's own:
 * it walks one agency at a time and every query names the agency it is working on. The
 * reading side — what an agent sees — goes back through the tenant client, where the
 * database does the scoping again.
 *
 * The matching itself is deterministic, and deliberately so. An agent who is shown a
 * property that does not fit their customer stops opening the page, and no amount of
 * fluent explanation buys that back. The model's turn comes after this, to write the
 * message for a match somebody has already agreed with.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
  ) {}

  /** Every agency, one after another. Returns how many new suggestions were raised. */
  async sweep(): Promise<{ raised: number }> {
    const agencies = await this.prisma.agency.findMany({ select: { id: true } });

    let raised = 0;
    for (const agency of agencies) {
      try {
        raised += await this.sweepAgency(agency.id);
      } catch (error) {
        // One agency's bad data must not stop the others being swept.
        this.logger.error(`Matching failed for ${agency.id}: ${(error as Error).message}`);
      }
    }

    if (raised > 0) this.logger.log(`Raised ${raised} new matches.`);
    return { raised };
  }

  /**
   * One agency's customers against one agency's inventory.
   *
   * Its own listings only, for now. A customer matching another agency's property is a
   * real and more valuable suggestion — it is the co-brokerage case — but it is also a
   * different product decision about what an agency's customer list is worth to
   * somebody else, and this is not the place to settle it quietly.
   */
  async sweepAgency(agencyId: string): Promise<number> {
    const [matches, elsewhere, others] = await Promise.all([
      this.matchesFor(agencyId),
      this.coBrokerageFor(agencyId),
      this.rules.all(agencyId),
    ]);

    return this.raise(agencyId, [...matches, ...elsewhere, ...others]);
  }

  /**
   * Writes what the rules noticed, skipping whatever is already there.
   *
   * `createMany` with `skipDuplicates` rather than an upsert: an observation that
   * already exists must be left exactly as it is, including a status somebody set. An
   * upsert would quietly reopen what an agent dismissed last week.
   */
  private async raise(agencyId: string, raised: Raised[]): Promise<number> {
    let count = 0;

    for (const row of raised) {
      const written = await this.prisma.suggestion.createMany({
        data: [{ agencyId, ...row }],
        skipDuplicates: true,
      });
      count += written.count;
    }

    return count;
  }

  /** Every customer's brief against every listing the agency holds. */
  private async matchesFor(agencyId: string): Promise<Raised[]> {
    const [customers, listings] = await Promise.all([
      this.prisma.customer.findMany({
        // Sellers are not shown things to buy. `both` is, because they are also buying.
        where: { agencyId, kind: { in: ['buyer', 'both'] } },
        select: BRIEF_SELECT,
      }),
      this.prisma.listing.findMany({
        where: { agencyId, status: 'published', delistedAt: null },
        select: CANDIDATE_SELECT,
      }),
    ]);

    if (customers.length === 0 || listings.length === 0) return [];

    // Every pair, which is fine at the size an agency actually is: a hundred customers
    // against five hundred listings is fifty thousand comparisons of a few numbers,
    // once an hour. A SQL join would be faster and would have to restate `matchBrief`
    // in a dialect nobody can test.
    const found: FoundMatch[] = [];

    for (const customer of customers) {
      for (const listing of listings) {
        const match = matchBrief(customer as Brief, listing as Candidate);
        if (!match) continue;

        found.push({
          customerId: customer.id,
          listingId: listing.id,
          ownerId: customer.assignedToId,
          score: match.score,
          reason: match.reason,
        });
      }
    }

    /**
     * What has been raised before, dropped before the caps rather than after — which is
     * what makes a cap mean "three new ones" instead of "three at all".
     */
    const seen = new Set(
      (
        await this.prisma.suggestion.findMany({
          where: { agencyId, kind: 'new_match' },
          select: { dedupeKey: true },
        })
      ).map((row) => row.dedupeKey),
    );

    return shortlistMatches(found, (match) => seen.has(this.dedupeKey(agencyId, match)), {
      perCustomer: PER_CUSTOMER_LIMIT,
      total: PER_AGENCY_LIMIT,
    }).map((match) => ({
      kind: 'new_match' as const,
      dedupeKey: this.dedupeKey(agencyId, match),
      ...match,
    }));
  }

  /**
   * This agency's customers against everybody else's inventory.
   *
   * The co-brokerage case, and the only rule here that looks outside the agency. It can
   * afford to: a published listing is already on the public marketplace, so nothing is
   * revealed by noticing it. The private half — who the buyer is — never leaves this
   * agency, and the request that may follow carries a brief rather than a person.
   *
   * Only between agencies that have opted in, only on strong matches, and only a few.
   * An agent who is sent to haggle with a stranger over half a commission for a
   * mediocre fit will not go a second time.
   */
  private async coBrokerageFor(agencyId: string): Promise<Raised[]> {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: { coBrokerage: true, vertical: true },
    });
    // A mortgage broker has no listings of its own and no business being sent another
    // agency's — this is the one rule here that looks outside the agency, and outside
    // the real-estate vertical there is nothing for it to find.
    if (!agency?.coBrokerage || agency.vertical !== 'real_estate') return [];

    const [customers, listings] = await Promise.all([
      this.prisma.customer.findMany({
        where: { agencyId, kind: { in: ['buyer', 'both'] } },
        select: BRIEF_SELECT,
      }),
      this.prisma.listing.findMany({
        where: {
          agencyId: { not: agencyId },
          status: 'published',
          delistedAt: null,
          // Both sides have to be in the network, and a scraped yad2 row is not an
          // agency on this platform agreeing to anything.
          source: 'manual',
          agency: { coBrokerage: true, status: 'active' },
        },
        select: { ...CANDIDATE_SELECT, agencyId: true },
        take: 2000,
      }),
    ]);

    if (customers.length === 0 || listings.length === 0) return [];

    const found: FoundMatch[] = [];

    for (const customer of customers) {
      for (const listing of listings) {
        const match = matchBrief(customer as Brief, listing as Candidate);
        if (!match || match.score < CO_BROKERAGE_MIN_SCORE) continue;

        found.push({
          customerId: customer.id,
          listingId: listing.id,
          ownerId: customer.assignedToId,
          score: match.score,
          reason: `${match.reason} — נכס של סוכנות אחרת`,
        });
      }
    }

    const raisedBefore = await this.prisma.suggestion.findMany({
      where: { agencyId, kind: 'cobroke_match' },
      select: { dedupeKey: true, status: true, customerId: true },
    });

    const seen = new Set(raisedBefore.map((row) => row.dedupeKey));

    /**
     * Customers who already have one of these open.
     *
     * The caps elsewhere are per sweep, which is right when the supply runs out: a
     * customer is offered three of their agency's listings, deals with them, and is
     * offered the next three. Every other agency's inventory does not run out, so the
     * same rule would add one per customer per hour until the page was nothing else.
     *
     * One at a time, then. The next is raised when this one has been acted on — which
     * is also the honest signal, because an agent who has not answered the last
     * introduction does not want a second.
     */
    const waiting = new Set(
      raisedBefore.filter((row) => row.status === 'open').map((row) => row.customerId),
    );

    return shortlistMatches(
      found,
      (match) =>
        seen.has(this.dedupeKey(agencyId, match, 'cobroke_match')) ||
        waiting.has(match.customerId),
      { perCustomer: 1, total: CO_BROKERAGE_LIMIT },
    ).map((match) => ({
      kind: 'cobroke_match' as const,
      dedupeKey: this.dedupeKey(agencyId, match, 'cobroke_match'),
      ...match,
    }));
  }

  /** The identity of the observation: this agency noticed this pair. */
  private dedupeKey(
    agencyId: string,
    match: { customerId: string; listingId: string },
    kind = 'new_match',
  ): string {
    return `${agencyId}:${kind}:${match.customerId}:${match.listingId}`;
  }
}
