import { Injectable } from '@nestjs/common';
import { assigneeScope } from '../auth/permissions.js';
import { isoWeek } from '../matching/period.js';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';

/** How far back the two charts look. Enough to see a trend, few enough to read. */
const WEEKS = 12;
const MONTHS = 6;

const DAY = 24 * 60 * 60 * 1000;

/**
 * The numbers on the first screen of the day.
 *
 * Deliberately one request. Six cards and two charts assembled from six hooks is six
 * spinners arriving in six different orders, and an overview that flickers is one
 * people stop reading.
 *
 * The series are bucketed in JavaScript from the rows rather than grouped in SQL. An
 * agency's leads and deals are hundreds, not millions, and the alternative is raw SQL
 * that has to be trusted to carry the tenant context — a correctness risk taken for a
 * saving nobody would measure.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
  ) {}

  async get(now = new Date()) {
    const agencyId = this.context.requireAgencyId();
    const principal = this.context.getPrincipal();
    const userId = principal?.userId ?? '';
    // The lead and deal figures are the agent's own book, the same rows their inbox and
    // board show; the owner sees the agency's.
    const leadScope = assigneeScope(principal, 'assignedToId');
    const dealScope = assigneeScope(principal, 'ownerId');

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + DAY);
    const weekAhead = new Date(startOfToday.getTime() + 7 * DAY);
    const weeksBack = new Date(now.getTime() - WEEKS * 7 * DAY);
    const monthsBack = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1);

    const [
      listings,
      viewingsToday,
      viewingsThisWeek,
      awaitingFeedback,
      openLeads,
      openSuggestions,
      coBrokerageWaiting,
      dealsByStage,
      recentLeads,
      closedDeals,
    ] = await Promise.all([
      this.prisma.client.listing.groupBy({
        by: ['status'],
        where: { agencyId, delistedAt: null },
        _count: { _all: true },
      }),

      this.prisma.client.meeting.count({
        where: { agencyId, status: 'scheduled', startsAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.client.meeting.count({
        where: { agencyId, status: 'scheduled', startsAt: { gte: startOfToday, lt: weekAhead } },
      }),
      // Past viewings nobody has written up — the chore the calendar chases.
      this.prisma.client.meeting.count({
        where: { agencyId, endsAt: { lt: now }, outcome: null, status: { not: 'cancelled' } },
      }),

      this.prisma.client.lead.count({
        where: { agencyId, status: { in: ['new', 'contacted'] }, ...leadScope },
      }),

      // Mine and the agency's unclaimed, which is what the radar itself shows.
      this.prisma.client.suggestion.count({
        where: { agencyId, status: 'open', OR: [{ ownerId: userId }, { ownerId: null }] },
      }),

      this.prisma.client.coBrokerageRequest.count({
        where: { holdingAgencyId: agencyId, status: 'pending' },
      }),

      this.prisma.client.deal.groupBy({
        by: ['stage'],
        where: { agencyId, ...dealScope },
        _count: { _all: true },
        _sum: { price: true, commission: true },
      }),

      this.prisma.client.lead.findMany({
        where: { agencyId, createdAt: { gte: weeksBack }, ...leadScope },
        select: { createdAt: true },
      }),

      this.prisma.client.deal.findMany({
        where: { agencyId, closedAt: { gte: monthsBack }, ...dealScope },
        select: { closedAt: true, stage: true, commission: true },
      }),
    ]);

    const byStatus = (status: string) =>
      listings.find((row) => row.status === status)?._count._all ?? 0;

    const stage = (name: string) => dealsByStage.find((row) => row.stage === name);
    const openStages = ['qualified', 'negotiation', 'under_contract'];

    return {
      today: {
        viewingsToday,
        viewingsThisWeek,
        awaitingFeedback,
        openLeads,
        openSuggestions,
        coBrokerageWaiting,
      },

      listings: {
        published: byStatus('published'),
        draft: byStatus('draft'),
        archived: byStatus('archived'),
      },

      pipeline: {
        stages: dealsByStage.map((row) => ({
          stage: row.stage,
          count: row._count._all,
          value: row._sum.price ?? 0,
          commission: row._sum.commission ?? 0,
        })),
        // What is still in play, which is the number an owner actually wants: a board
        // total that counts last year's losses is a number nobody can use.
        openCount: dealsByStage
          .filter((row) => openStages.includes(row.stage))
          .reduce((sum, row) => sum + row._count._all, 0),
        openValue: dealsByStage
          .filter((row) => openStages.includes(row.stage))
          .reduce((sum, row) => sum + (row._sum.price ?? 0), 0),
        openCommission: dealsByStage
          .filter((row) => openStages.includes(row.stage))
          .reduce((sum, row) => sum + (row._sum.commission ?? 0), 0),
        wonCount: stage('closed_won')?._count._all ?? 0,
        wonCommission: stage('closed_won')?._sum.commission ?? 0,
      },

      leadsByWeek: this.bucketWeeks(recentLeads.map((l) => l.createdAt), now),
      dealsByMonth: this.bucketMonths(closedDeals, now),
    };
  }

  /**
   * The last `WEEKS` weeks, including the ones with nothing in them.
   *
   * Empty buckets are the point of a chart: a bar chart drawn only from the weeks that
   * had leads shows a flat line through a dry month and hides exactly the thing
   * somebody opened it to see.
   */
  private bucketWeeks(dates: Date[], now: Date) {
    const counts = new Map<string, number>();
    for (const date of dates) {
      const key = isoWeek(date);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const series: { key: string; count: number }[] = [];
    for (let i = WEEKS - 1; i >= 0; i -= 1) {
      const key = isoWeek(new Date(now.getTime() - i * 7 * DAY));
      series.push({ key, count: counts.get(key) ?? 0 });
    }
    return series;
  }

  /**
   * The month a date falls in, by the server's own clock.
   *
   * Not `isoMonth`, which reads the date in UTC: the series below is built from local
   * dates, and keying those in UTC put every bucket a month behind for the two hours
   * either side of midnight — the current month simply did not appear on the chart.
   * The only thing that matters is that the buckets and the series use one clock, and
   * this is it.
   */
  private monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  /** The same, by month, split into won and lost. */
  private bucketMonths(
    deals: { closedAt: Date | null; stage: string; commission: number | null }[],
    now: Date,
  ) {
    const buckets = new Map<string, { won: number; lost: number; commission: number }>();

    for (const deal of deals) {
      if (!deal.closedAt) continue;
      const key = this.monthKey(deal.closedAt);
      const bucket = buckets.get(key) ?? { won: 0, lost: 0, commission: 0 };

      if (deal.stage === 'closed_won') {
        bucket.won += 1;
        bucket.commission += deal.commission ?? 0;
      } else if (deal.stage === 'closed_lost') {
        bucket.lost += 1;
      }

      buckets.set(key, bucket);
    }

    const series: { key: string; won: number; lost: number; commission: number }[] = [];
    for (let i = MONTHS - 1; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = this.monthKey(date);
      series.push({ key, ...(buckets.get(key) ?? { won: 0, lost: 0, commission: 0 }) });
    }
    return series;
  }
}
