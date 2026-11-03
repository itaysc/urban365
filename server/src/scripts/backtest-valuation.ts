/**
 * Checks the valuation against sales it was not allowed to see.
 *
 *   npm run backtest:valuation
 *   npm run backtest:valuation -- --sample 500
 *
 * Every held-out sale is valued as of the day it happened, then compared with what it
 * actually fetched. It calls `ValuationService.value` — the same method the API calls,
 * through the same pure functions — because a back-test that reimplements the model
 * tests the reimplementation.
 *
 * ## The blind quarter
 *
 * `asOf` is the sale date, and the service does the rest: from it, `reportedThrough`
 * works out the newest month the registry could have told us about by then, hides
 * every comparable after it, and restates the index so the answer comes out in that
 * month's money. A sale in November 2025 is therefore valued from evidence that stops
 * in August, held flat across the gap — which is precisely the position a valuation
 * made that November would have been in.
 *
 * That lag used to be subtracted here instead, and only from the comparables. The
 * index went on quoting every answer in the parameters' own base month — June 2026 —
 * so a flat sold in 2025 was valued in 2026 money and marked against a 2025 price.
 * The gap between the two was reported as a four per cent low bias in the model. It
 * was arithmetic working as designed, measured wrongly.
 *
 * ## What this cannot tell us
 *
 * The registry records no floor, condition, parking, balcony, ממ״ד, aspect or
 * building state, so every subject here is valued with a blank data sheet and a
 * quality multiplier of exactly 1. That means the numbers below measure the
 * comparable selection, the price index and the size exponent — and say **nothing**
 * about whether the attribute table in `adjustments.ts` is right. A real user fills
 * that sheet in, so their estimate should be better than these figures, not worse;
 * but "should" is doing real work in that sentence and nothing here verifies it.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ValuationService } from '../valuation/valuation.service.js';
import { by, study, type Ratio, type Study } from '../valuation/ratio-study.js';

/**
 * The hold-out window.
 *
 * Late enough that the price index covers it, early enough to sit well inside the
 * complete data — the registry's last months are partially reported and their prices
 * are not real, so testing against them would be testing against an artefact.
 */
const FROM = '2025-07-01';
const TO = '2026-03-31';

const DEFAULT_SAMPLE = 1_200;

interface Target {
  id: string;
  settlement: string;
  settlementCode: number;
  gush: number;
  chelka: number;
  dealDate: Date;
  dealAmount: bigint;
  area: number;
  rooms: number;
  latitude: number;
  longitude: number;
}

const BLANK = {
  floor: null, topFloor: null, hasLift: null, condition: null, hasParking: null,
  hasStorage: null, hasBalcony: null, hasMamad: null, aspect: null,
  buildingState: null, renewal: null,
} as const;

async function main() {
  const logger = new Logger('Backtest');
  const args = process.argv.slice(2);
  const sampleAt = args.indexOf('--sample');
  const sample = sampleAt === -1 ? DEFAULT_SAMPLE : Number(args[sampleAt + 1]);

  if (!Number.isFinite(sample) || sample <= 0) {
    logger.error('--sample needs a positive number');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const valuation = app.get(ValuationService);

  try {
    /*
     * `ORDER BY md5(id)` rather than `random()`: the same sample every run, so a
     * change in the numbers is a change in the model rather than in the draw.
     */
    const targets = await prisma.$queryRawUnsafe<Target[]>(`
      SELECT id, settlement, "settlementCode", gush, chelka, "dealDate", "dealAmount",
             area, rooms, latitude, longitude
      FROM "MarketDeal"
      WHERE "propertyGroup" = 'apartment'
        AND "inStats" AND "isFullDeal"
        AND "dealDate" >= '${FROM}' AND "dealDate" <= '${TO}'
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND area BETWEEN 20 AND 400 AND rooms BETWEEN 1 AND 10
        AND "pricePerSqm" BETWEEN 3000 AND 150000
        AND NOT ("yearBuilt" IS NOT NULL AND "yearBuilt" >= extract(year from "dealDate"))
      ORDER BY md5(id)
      LIMIT ${Math.floor(sample)}
    `);

    logger.log(
      `Valuing ${targets.length} held-out sales from ${FROM}…${TO}, ` +
        `each blind to everything the registry had not yet reported.`,
    );

    const ratios: (Ratio & { target: Target; effective: number; verdict: string })[] = [];
    const refused = new Map<string, number>();
    let done = 0;

    for (const target of targets) {
      const result = await valuation.value({
        city: target.settlement,
        latitude: target.latitude,
        longitude: target.longitude,
        gush: target.gush,
        chelka: target.chelka,
        settlementCode: target.settlementCode,
        rooms: target.rooms,
        area: target.area,
        attributes: { ...BLANK },
        // Market state is a property of today, not of the test; held neutral.
        market: 'balanced',
        asOf: target.dealDate,
      });

      done += 1;
      if (done % 200 === 0) logger.log(`  ${done}/${targets.length}…`);

      if (!result.value || !result.range) {
        refused.set(result.verdict, (refused.get(result.verdict) ?? 0) + 1);
        continue;
      }

      const actual = Number(target.dealAmount);
      ratios.push({
        target,
        actual,
        estimate: result.value,
        ratio: result.value / actual,
        covered: actual >= result.range.low && actual <= result.range.high,
        effective: result.workings.effective,
        verdict: result.verdict,
      });
    }

    const answered = ratios.length;
    const total = targets.length;

    console.log(`\n${'═'.repeat(72)}`);
    console.log(`Answered ${answered} of ${total} (${pct(answered / total)}); refused ${total - answered}`);
    for (const [why, count] of [...refused].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${why.padEnd(14)} ${count}`);
    }

    const overall = study(ratios);
    if (!overall) {
      logger.error('No valuations to score.');
      process.exitCode = 1;
      return;
    }

    console.log(`\n${'═'.repeat(72)}\nOverall`);
    print('all', overall);

    console.log(`\n${'═'.repeat(72)}\nBy confidence`);
    table(by(ratios, (r) => (r as (typeof ratios)[number]).verdict));

    console.log(`\n${'═'.repeat(72)}\nBy effective comparables`);
    table(
      by(ratios, (r) => {
        const n = (r as (typeof ratios)[number]).effective;
        return n < 8 ? 'effN <8' : n < 15 ? 'effN 8–15' : n < 40 ? 'effN 15–40' : 'effN 40+';
      }),
    );

    console.log(`\n${'═'.repeat(72)}\nBy settlement (the ten most tested)`);
    const bySettlement = by(ratios, (r) => (r as (typeof ratios)[number]).target.settlement, 25);
    for (const [name, result] of [...bySettlement].sort((a, b) => b[1].n - a[1].n).slice(0, 10)) {
      print(name, result);
    }

    console.log(`\n${'═'.repeat(72)}\nBy size`);
    table(
      by(ratios, (r) => {
        const area = (r as (typeof ratios)[number]).target.area;
        return area < 60 ? '<60 m²' : area < 90 ? '60–90' : area < 120 ? '90–120' : '120+ m²';
      }),
    );

    console.log(`\n${'═'.repeat(72)}`);
    verdictOn(overall);
  } finally {
    await app.close();
  }
}

function table(groups: Map<string, Study>) {
  for (const [name, result] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    print(name, result);
  }
}

function print(name: string, s: Study) {
  console.log(
    `  ${name.padEnd(14)} n=${String(s.n).padStart(5)}  ` +
      `median ${s.medianRatio.toFixed(3)}  COD ${s.cod.toFixed(1).padStart(5)}  ` +
      `PRD ${s.prd.toFixed(3)}  ±10% ${pct(s.withinTen).padStart(5)}  ` +
      `±20% ${pct(s.withinTwenty).padStart(5)}  covered ${pct(s.coverage).padStart(5)}`,
  );
}

/**
 * Say plainly whether this is good enough, against stated thresholds.
 *
 * Written down here rather than left to whoever reads the table, because a number
 * without a threshold beside it gets graded on a curve by the person who produced it.
 */
function verdictOn(s: Study) {
  const checks: [string, boolean, string][] = [
    ['Bias', Math.abs(s.medianRatio - 1) <= 0.05, `median ratio ${s.medianRatio.toFixed(3)}, want 0.95–1.05`],
    ['Precision', s.cod <= 20, `COD ${s.cod.toFixed(1)}, want ≤20 (IAAO says ≤15 for inspected homes)`],
    ['Fairness', s.prd >= 0.97 && s.prd <= 1.03, `PRD ${s.prd.toFixed(3)}, want 0.97–1.03`],
    ['Coverage', s.coverage >= 0.45 && s.coverage <= 0.75, `${pct(s.coverage)} of sales inside the range, want 45–75%`],
  ];

  for (const [name, ok, detail] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(10)} ${detail}`);
  }

  console.log(
    '\n  The range is quoted as the middle half of likely outcomes, so coverage near\n' +
      '  50% is the target — much above it means the range is wider than it needs to be.\n' +
      '  None of this tests the attribute table: every subject here had a blank sheet.',
  );
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
