import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { cellRangeWithin } from '../cadastre/parcel-index.js';
import { quantile } from '../seo/stats.js';

import { elasticityFor, normaliseToSize } from './elasticity.js';
import {
  carryForward,
  monthsExtrapolated,
  rebase,
  reportedThrough,
} from './index-series.js';
import { PARAMS, indexFor } from './params.js';
import { positionOf, referenceFor, type Subject as Attributes } from './adjustments.js';
import { rangeFor, type MarketState, type Range } from './range.js';
import { weightedMedian } from './weighted.js';
import {
  TIERS,
  score,
  strengthOf,
  trim,
  widen,
  type CompRow,
  type Rejected,
  type ScoredComp,
  type Subject as Where,
} from './comps.js';

/**
 * Assembling a valuation out of the pieces.
 *
 * Every judgement lives in the pure files beside this one; this one fetches rows,
 * calls them in order and writes the answer down. Keeping it that way is what lets
 * the back-test exercise the same arithmetic the API runs, which is the only reason
 * its numbers mean anything.
 *
 * The order is the guide's, and it is not interchangeable:
 *
 *   1. find comparable sales, and weight them by how comparable they are
 *   2. restate each one at today's prices and the subject's size
 *   3. trim what still disagrees — *after* step 2, never before
 *   4. pool them into one rate
 *   5. position the subject against the sort of flat those sales are
 *   6. turn the estimate into a range, and a price inside it
 */

/** How far out we are willing to look. The widest tier in `comps.ts`. */
const MAX_METRES = TIERS[TIERS.length - 1].metres;

/**
 * How far back comparable sales are taken from.
 *
 * The guide asks for six months. Against this registry that window is empty — deals
 * surface about three months late and the upstream mirror has stopped — so we take
 * two years and carry every sale forward with the price index instead. Longer would
 * add sales from a market that no longer exists; the index corrects the level, not
 * a change in what buyers want.
 */
const WINDOW_MONTHS = 24;

/**
 * A ceiling, not a working limit.
 *
 * It was 1,500 ordered by date, which quietly broke dense cities: central Tel Aviv
 * has about 9,000 qualifying sales in range but only 41 within 400 m, so the newest
 * 1,500 were nearly all distant — and more than half of those were developer sales
 * that then got rejected. The subject's own street never made it into the query.
 * With the bounding box below the real figure is a few thousand, and this only ever
 * catches something pathological.
 */
const MAX_CANDIDATES = 15_000;

export interface ValuationRequest {
  city: string;
  latitude: number;
  longitude: number;
  gush: number | null;
  chelka: number | null;
  settlementCode: number | null;
  rooms: number;
  /** Registered area in m². Balconies are asked for separately and not added here. */
  area: number;
  attributes: Attributes;
  /** From `market-state.ts`; 'balanced' when our inventory cannot tell. */
  market: MarketState;
  /**
   * Pretend it is this date, for the back-test.
   *
   * Everything that depends on when the valuation is made follows from it: which
   * sales had been reported by then, what money the answer is quoted in, and how far
   * past the evidence it is reaching. The back-test needs all three to move together
   * — a valuation of a flat sold in March 2026 that could see April's sales, or that
   * quoted its answer in a later year's money, would be marking its own homework.
   * The API never sets it, so there is one code path rather than two.
   */
  asOf?: Date;
}

export type Verdict = 'good' | 'indicative' | 'too-thin' | 'out-of-scope' | 'no-comps';

export interface ValuationResult {
  verdict: Verdict;
  /** Null whenever `verdict` is not 'good' or 'indicative'. */
  range: Range | null;
  value: number | null;
  workings: Workings;
}

export interface Workings {
  pooledRate: number | null;
  elasticity: { b: number; source: string };
  reference: { yearBuilt: number } | null;
  quality: { q: number; parts: { label: string; factor: number }[]; clamped: boolean } | null;
  comps: UsedComp[];
  rejected: Rejected[];
  effective: number;
  weightSum: number;
  spread: number;
  monthsExtrapolated: number;
  market: MarketState;
  /** The widest tier the comp set had to reach for. */
  reachedTier: string;
  paramsVersion: number;
  paramsBase: string;
}

export interface UsedComp {
  id: string;
  dealDate: string;
  metres: number;
  tier: string;
  weight: number;
  rooms: number;
  area: number;
  /** As recorded. */
  pricePerSqm: number;
  /** Carried to today and restated at the subject's size — what actually pooled. */
  normalised: number;
}

/** Area outside this is not a flat we can price from flat comparables. */
const MIN_AREA = 20;
const MAX_AREA = 400;

@Injectable()
export class ValuationService {
  private readonly logger = new Logger(ValuationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async value(request: ValuationRequest): Promise<ValuationResult> {
    const now = request.asOf ?? new Date();
    const empty = this.blank(request, now);

    if (request.area < MIN_AREA || request.area > MAX_AREA) {
      return { verdict: 'out-of-scope', range: null, value: null, workings: empty };
    }

    /*
     * Everything time-dependent hangs off one month: the newest the registry could
     * have told us about by `now`. Comparables stop there, and the index is restated
     * so the answer comes out in that month's money rather than the parameters'.
     */
    const reported = reportedThrough(PARAMS.base, now);

    const candidates = await this.candidates(request, reported);
    const { comps, rejected } = score(this.where(request), candidates, now);

    if (comps.length === 0) {
      return {
        verdict: 'no-comps',
        range: null,
        value: null,
        workings: { ...empty, rejected },
      };
    }

    /*
     * Normalisation, then trimming — in that order, and the order is the point. An
     * unadjusted set mixes a 2022 sale with a 2026 one, so trimming it first would
     * discard the oldest rather than the oddest, and do it in the name of removing
     * outliers.
     */
    const elasticity = elasticityFor(request.area, PARAMS.elasticity);
    const index = rebase(indexFor(request.settlementCode), reported);

    const normalised = comps.map((comp) => ({
      ...comp,
      normalisedRate:
        normaliseToSize(comp.pricePerSqm, comp.area, request.area, elasticity.b) *
        carryForward(index, month(comp.dealDate)),
    }));

    /*
     * Take the tightest ring that can answer, then trim it — in that order. Trimming
     * the whole 2.5 km pool first would set the centre by the town rather than by
     * the street, and then discard the street for disagreeing with it.
     */
    const widened = widen(normalised);
    const trimmed = trim(widened.used, (c) => c.normalisedRate);
    const used = trimmed.kept;

    const strength = strengthOf(used);
    const pooled = weightedMedian(
      used.map((c) => ({ value: c.normalisedRate, weight: c.weight })),
    );

    const rates = used.map((c) => c.normalisedRate);
    const q1 = quantile(rates, 0.25);
    const q3 = quantile(rates, 0.75);
    const spread = pooled && q1 !== null && q3 !== null ? (q3 - q1) / pooled : 1;

    /*
     * The reference profile: what the comparables are presumed to offer, taken from
     * the era they come from. Derived rather than assumed, because assuming a
     * reference with no lift and no parking would hand a premium to every flat that
     * has them — including the ones whose comparables have them too.
     */
    const reference = referenceFor(this.referenceYear(used));
    const quality = positionOf(request.attributes, reference);

    const workings: Workings = {
      pooledRate: pooled,
      elasticity: { b: elasticity.b, source: elasticity.source },
      reference: { yearBuilt: reference.yearBuilt },
      quality,
      comps: used.map(toUsed),
      rejected: [...rejected, ...trimmed.rejected],
      effective: strength.effective,
      weightSum: strength.weightSum,
      spread,
      monthsExtrapolated: monthsExtrapolated(index, now),
      market: request.market,
      reachedTier: widened.stoppedAt,
      paramsVersion: PARAMS.version,
      paramsBase: PARAMS.base,
    };

    if (strength.verdict === 'too-thin' || pooled === null) {
      return { verdict: 'too-thin', range: null, value: null, workings };
    }

    const value = request.area * pooled * quality.q;

    const range = rangeFor(
      value,
      {
        spread,
        effective: strength.effective,
        unknownFields: unansweredIn(request.attributes),
        monthsExtrapolated: workings.monthsExtrapolated,
        qClamped: quality.clamped,
      },
      request.market,
    );

    // A spread too wide to pool is a refusal, not a very wide range.
    if (!range) return { verdict: 'too-thin', range: null, value: null, workings };

    return { verdict: strength.verdict, range, value, workings };
  }

  /**
   * Candidate sales near the subject.
   *
   * The cell columns carry this: without them it is a bounding-box scan over three
   * million rows. `isFullDeal`/`inStats` are the registry's own verdict on whether a
   * row belongs in a statistic, and are trusted rather than recomputed — they have
   * the whole dataset and we hold a copy of it.
   */
  private async candidates(request: ValuationRequest, reported: string): Promise<CompRow[]> {
    const cells = cellRangeWithin(request.latitude, request.longitude, MAX_METRES);

    const until = endOfMonth(reported);
    const since = new Date(until);
    since.setMonth(since.getMonth() - WINDOW_MONTHS);

    /*
     * Cells get us an index scan; the bounding box trims what it returns. A cell
     * block wide enough for 2.5 km covers roughly 66 km² against the circle's 20,
     * so without this two rows in three are fetched only to be measured and thrown
     * away.
     */
    const latSpan = MAX_METRES / 111_320;
    const lngSpan =
      MAX_METRES / (111_320 * Math.max(0.1, Math.cos((request.latitude * Math.PI) / 180)));

    const rows = await this.prisma.marketDeal.findMany({
      where: {
        cellLat: { gte: cells.minCellLat, lte: cells.maxCellLat },
        cellLng: { gte: cells.minCellLng, lte: cells.maxCellLng },
        latitude: { gte: request.latitude - latSpan, lte: request.latitude + latSpan },
        longitude: { gte: request.longitude - lngSpan, lte: request.longitude + lngSpan },
        /*
         * Bounded above by the last completely-reported month, not by today. The
         * months after it are the registry's partially-registered tail — the same
         * sample the index refuses to be fitted through — and a comp set has no more
         * business drawing on them than the index does. It is also what stops a
         * back-test seeing its own answer.
         */
        dealDate: { gte: since, lte: until },
        propertyGroup: { in: ['apartment', 'garden_apartment'] },
        inStats: true,
        isFullDeal: true,
        area: { not: null },
        rooms: { not: null },
        pricePerSqm: { not: null },
      },
      orderBy: { dealDate: 'desc' },
      take: MAX_CANDIDATES,
      select: {
        id: true,
        latitude: true,
        longitude: true,
        gush: true,
        chelka: true,
        dealDate: true,
        area: true,
        rooms: true,
        pricePerSqm: true,
        dealAmount: true,
        yearBuilt: true,
        settlementCode: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      latitude: row.latitude!,
      longitude: row.longitude!,
      gush: row.gush,
      chelka: row.chelka,
      dealDate: row.dealDate,
      area: row.area!,
      rooms: row.rooms!,
      pricePerSqm: row.pricePerSqm!,
      dealAmount: Number(row.dealAmount),
      yearBuilt: row.yearBuilt,
      settlementCode: row.settlementCode,
    }));
  }

  /**
   * The era the comparables come from, weighted the way they are.
   *
   * A weighted median rather than a mean: build years cluster on round decades in
   * this data — 1970 and 1960 are dumping grounds for "about then" — and a mean
   * would sit between two clusters, describing a vintage none of them has.
   */
  private referenceYear(comps: (ScoredComp & { normalisedRate: number })[]): number {
    const known = comps
      .filter((c) => c.yearBuilt !== null)
      .map((c) => ({ value: c.yearBuilt!, weight: c.weight }));

    // Nothing to go on: assume the national middle rather than refuse outright.
    return Math.round(weightedMedian(known) ?? 1980);
  }

  private where(request: ValuationRequest): Where {
    return {
      latitude: request.latitude,
      longitude: request.longitude,
      gush: request.gush,
      chelka: request.chelka,
      area: request.area,
      rooms: request.rooms,
      settlementCode: request.settlementCode,
    };
  }

  private blank(request: ValuationRequest, now: Date): Workings {
    return {
      pooledRate: null,
      elasticity: elasticityFor(request.area, PARAMS.elasticity),
      reference: null,
      quality: null,
      comps: [],
      rejected: [],
      effective: 0,
      weightSum: 0,
      spread: 1,
      monthsExtrapolated: monthsExtrapolated(
        rebase(indexFor(request.settlementCode), reportedThrough(PARAMS.base, now)),
        now,
      ),
      market: request.market,
      reachedTier: 'same-parcel',
      paramsVersion: PARAMS.version,
      paramsBase: PARAMS.base,
    };
  }

  /** Keep the estimate exactly as it was given. See the `Valuation` model's own note. */
  async record(
    request: ValuationRequest,
    result: ValuationResult,
    userId: string | null,
  ): Promise<string> {
    const row = await this.prisma.valuation.create({
      data: {
        userId,
        input: request as unknown as object,
        settlementCode: request.settlementCode,
        city: request.city,
        gush: request.gush,
        chelka: request.chelka,
        latitude: request.latitude,
        longitude: request.longitude,
        rooms: request.rooms,
        area: request.area,
        low: result.range?.low ?? null,
        high: result.range?.high ?? null,
        expected: result.range?.expected ?? null,
        asking: result.range?.asking ?? null,
        verdict: result.verdict,
        workings: result.workings as unknown as object,
        paramsVersion: result.workings.paramsVersion,
        paramsBase: result.workings.paramsBase,
        effectiveComps: result.workings.effective,
        spread: result.workings.spread,
      },
      select: { id: true },
    });

    return row.id;
  }
}

const month = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/** The last instant of a `YYYY-MM`, so a whole month's sales are inside the bound. */
function endOfMonth(at: string): Date {
  const [year, index] = at.split('-').map(Number);
  return new Date(Date.UTC(year, index, 0, 23, 59, 59, 999));
}

const toUsed = (comp: ScoredComp & { normalisedRate: number }): UsedComp => ({
  id: comp.id,
  dealDate: comp.dealDate.toISOString().slice(0, 10),
  metres: Math.round(comp.metres),
  tier: comp.tier,
  weight: Number(comp.weight.toFixed(4)),
  rooms: comp.rooms,
  area: comp.area,
  pricePerSqm: comp.pricePerSqm,
  normalised: Math.round(comp.normalisedRate),
});

/**
 * How much of the data sheet went unanswered.
 *
 * Feeds the range rather than the estimate: a blank field is a piece of the
 * difference between this flat and its comparables that nobody has accounted for,
 * and the honest place to put it is the width.
 */
export function unansweredIn(attributes: Attributes): number {
  return Object.values(attributes).filter((value) => value === null).length;
}
