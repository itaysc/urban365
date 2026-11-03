/**
 * Measures the valuation's parameters from the deals table and writes them down.
 *
 *   npm run fit:valuation                 # refit everything, write the JSON
 *   npm run fit:valuation -- --dry-run    # print what would change, write nothing
 *
 * Two things are fitted here: the **size elasticity** per settlement, and the
 * **monthly price index**, nationally and per settlement. Both land in one versioned
 * file, `src/valuation/params/valuation-params.json`, which is checked in and read at
 * runtime — the same way this repo already treats its other reference data.
 *
 * Checked in rather than computed on boot for one reason: every stored valuation
 * stamps the version it used, and a seller who screenshots a number must be able to
 * get that number back. Parameters that silently refit under a running service make
 * yesterday's valuation unreproducible.
 *
 * The data is frozen (the upstream mirror stopped updating), so in practice this runs
 * when the method changes rather than on a schedule.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AREA_MAX_RATIO, AREA_MIN_RATIO } from '../valuation/comps.js';
import { B_MAX, B_MIN, type SizeKnot } from '../valuation/elasticity.js';
import {
  buildIndex,
  completeThrough,
  type MonthObservation,
} from '../valuation/index-series.js';

/** Bumped by hand when the *method* changes, not when the data does. */
const PARAMS_VERSION = 2;

/**
 * The window the parameters are fitted over.
 *
 * Four years is long enough to fit an exponent per settlement and to carry an index
 * across the 2022–2024 rise, and short enough that the earliest months still describe
 * a recognisably similar market.
 */
const FROM = '2022-01-01';

/** Fitting is pointless below this; the national figure serves instead. */
const MIN_INDEX_DEALS = 400;

/** The size every deal is restated at before the monthly median is taken. */
const REFERENCE_AREA = 90;

/**
 * Below this a settlement cannot stand as its own yardstick in the national series.
 *
 * See {@link main}'s national query: each deal is measured against its own town's
 * long-run level, and a town with forty recorded sales has no reliable level to be
 * measured against. Those deals are left out of the national series — about two per
 * cent of them — rather than allowed to move it.
 */
const MIN_PLACE_DEALS = 200;

/**
 * Where the national size curve is measured.
 *
 * Closely spaced where it bends and sparse where it does not, and stopping at 320 m²
 * because past that the registry has a few thousand sales of a different kind of
 * property. `elasticityFor` interpolates between them and holds flat outside.
 *
 * 25 m² is deliberately absent: its window reaches below the 20 m² floor every other
 * query here applies, so the slope it returns is the slope of a truncated sample.
 */
const KNOTS = [30, 40, 50, 60, 70, 85, 100, 120, 145, 175, 210, 260, 320];

/** Below this a settlement's own slope is noise; the national figure serves instead. */
const MIN_MIX_FITS = 500;

const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/valuation/params/valuation-params.json',
);

interface ElasticityRow {
  settlementCode: number;
  settlement: string;
  n: bigint;
  b: number | null;
}

interface MonthRow {
  settlementCode: number | null;
  month: string;
  n: bigint;
  rate: number;
}

async function main() {
  const logger = new Logger('FitValuation');
  const dryRun = process.argv.includes('--dry-run');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const prisma = app.get(PrismaService);

  try {
    /*
     * One shared definition of a usable deal, applied everywhere below: a second-hand
     * flat, in the Tax Authority's own statistics, with a believable rate and area.
     * `yearBuilt >= year(dealDate)` is a developer sale — see `comps.ts` — and those
     * are a different product whose prices would bend both the exponent and the index.
     */
    const usableIn = (at: string) => `
      ${at}."propertyGroup" = 'apartment'
      AND ${at}."inStats"
      AND ${at}."dealDate" >= '${FROM}'
      AND ${at}."pricePerSqm" BETWEEN 3000 AND 150000
      AND ${at}.area BETWEEN 20 AND 400
      AND NOT (${at}."yearBuilt" IS NOT NULL AND ${at}."yearBuilt" >= extract(year from ${at}."dealDate"))
    `;
    const usable = usableIn('m');

    logger.log('Fitting size elasticity…');

    /*
     * ln(rate) against ln(area): the slope is the exponent b in rate ∝ area^b.
     * Postgres' regr_slope does this in one pass, which matters at a quarter of a
     * million rows per refit.
     */
    const national = await prisma.$queryRawUnsafe<{ n: bigint; b: number | null }[]>(`
      SELECT count(*) AS "n", regr_slope(ln(m."pricePerSqm"), ln(m.area)) AS "b"
      FROM "MarketDeal" m WHERE ${usable}
    `);

    const nationalB = bounded(national[0]?.b ?? null) ?? -0.193;

    /*
     * Every slope below is fitted on *place-adjusted* rates: each sale divided by its
     * own town's long-run median. Without it the national curve is partly a map —
     * small flats cluster in expensive centres, large ones in cheap suburbs — and the
     * geography is read back as a size effect.
     */
    const placeAdjusted = `
      WITH adjusted AS (
        SELECT d."settlementCode" AS code, d.area AS area, d."pricePerSqm" AS rate
        FROM "MarketDeal" d
        WHERE ${usableIn('d')} AND d."settlementCode" IS NOT NULL
      ),
      baseline AS (
        SELECT code, percentile_cont(0.5) WITHIN GROUP (ORDER BY rate) AS rate
        FROM adjusted GROUP BY code HAVING count(*) >= ${MIN_PLACE_DEALS}
      ),
      relative AS (
        SELECT a.code, a.area, a.rate / b.rate AS rel
        FROM adjusted a JOIN baseline b USING (code)
      )
    `;

    /*
     * The shape: one slope per knot, each fitted over the same size window the
     * comparables around a flat that size would be drawn from. Fitting it that way
     * rather than differencing a curve means every number here is a regression over
     * tens of thousands of sales rather than the gap between two noisy medians.
     */
    const knotRows = await prisma.$queryRawUnsafe<{ area: number; n: bigint; b: number | null }[]>(`
      ${placeAdjusted}, knots(area) AS (VALUES ${KNOTS.map((k) => `(${k})`).join(', ')})
      SELECT k.area AS "area", count(*) AS "n",
             regr_slope(ln(r.rel), ln(r.area)) AS "b"
      FROM knots k
      JOIN relative r ON r.area BETWEEN k.area * ${AREA_MIN_RATIO} AND k.area * ${AREA_MAX_RATIO}
      GROUP BY k.area ORDER BY k.area
    `);

    const byArea: SizeKnot[] = [];
    for (const row of knotRows) {
      const b = bounded(row.b);
      if (b === null) continue;
      byArea.push({ area: Number(row.area), b: round(b, 4), n: Number(row.n) });
    }

    /*
     * The all-sizes slope per settlement is kept for one job only: restating each
     * deal to a common size before the monthly medians are taken, so the index does
     * not move when the size mix does. It is a mix control, not the valuation's
     * exponent, and it never leaves this script.
     */
    const mixRows = await prisma.$queryRawUnsafe<ElasticityRow[]>(`
      SELECT m."settlementCode", max(m.settlement) AS "settlement", count(*) AS "n",
             regr_slope(ln(m."pricePerSqm"), ln(m.area)) AS "b"
      FROM "MarketDeal" m WHERE ${usable} AND m."settlementCode" IS NOT NULL
      GROUP BY m."settlementCode" HAVING count(*) >= ${MIN_MIX_FITS}
    `);

    const mixSlopes: Record<string, number> = {};
    for (const row of mixRows) {
      const b = bounded(row.b);
      if (b !== null) mixSlopes[String(row.settlementCode)] = b;
    }

    logger.log(
      `  national b = ${nationalB.toFixed(4)} over ${Number(national[0].n).toLocaleString()} deals`,
    );
    logger.log(
      `  size curve: ${byArea.map((k) => `${k.area}m²=${k.b.toFixed(2)}`).join(' ')}`,
    );
    logger.log(
      `  ${Object.keys(mixSlopes).length} settlement slopes kept as the index's size-mix control`,
    );

    logger.log('Building the price index…');

    /*
     * Every deal is restated as the rate a {@link REFERENCE_AREA} flat would have
     * fetched, using the exponent just fitted for its own settlement. Without this the
     * monthly median moves whenever the *mix* of sizes moves — a quarter heavy on
     * small flats reads as a rise, and the index carries that straight into every
     * valuation. The reference size itself cancels out of the month-on-month ratios;
     * what it buys is that the months are comparable to each other.
     */
    const exponents =
      Object.entries(mixSlopes)
        .map(([code, b]) => `(${code}, ${b})`)
        .join(', ') || '(NULL::int, NULL::float)';

    const normalised = `
      WITH fitted(code, b) AS (VALUES ${exponents})
      SELECT d."settlementCode",
             to_char(d."dealDate", 'YYYY-MM') AS "month",
             count(*) AS "n",
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY d."pricePerSqm"
                        * power(${REFERENCE_AREA}::float / d.area, COALESCE(f.b, ${nationalB}))
             ) AS "rate"
      FROM "MarketDeal" d
      LEFT JOIN fitted f ON f.code = d."settlementCode"
      WHERE ${usableIn('d')}
    `;

    const months = await prisma.$queryRawUnsafe<MonthRow[]>(
      `${normalised} GROUP BY 1, 2`,
    );

    /*
     * The national series is measured in *relative* terms — each deal against its own
     * town's long-run level — and that is the whole point of it.
     *
     * Taken as a plain national median it moves whenever the geographic mix of what
     * happened to transact moves, and that mix moves a lot: the raw series swings
     * about three per cent month to month, in a market whose half-yearly medians sit
     * inside three and a half per cent of each other for two years. Those swings are
     * not sampling error — three thousand deals pin a median to well under one per
     * cent — they are months where Tel Aviv or Dimona was over-represented. Dividing
     * by the town's own level removes it: the same series then moves by well under a
     * per cent a month.
     *
     * It matters twice over. The base month sets the level every valuation in the
     * country is quoted at, so a month that happened to be cheap in the mix made
     * every estimate cheap; and the same tail that looked like a 35% collapse is
     * mostly cheaper *places* registering first, not cheaper *flats*.
     *
     * The series comes out unitless, around 1. {@link buildIndex} only ever reads
     * month-on-month ratios from it, so the units cancel.
     */
    const nationalMonths = await prisma.$queryRawUnsafe<MonthRow[]>(`
      WITH fitted(code, b) AS (VALUES ${exponents}),
      adjusted AS (
        SELECT d."settlementCode",
               to_char(d."dealDate", 'YYYY-MM') AS month,
               d."pricePerSqm" * power(${REFERENCE_AREA}::float / d.area, COALESCE(f.b, ${nationalB})) AS rate
        FROM "MarketDeal" d
        LEFT JOIN fitted f ON f.code = d."settlementCode"
        WHERE ${usableIn('d')} AND d."settlementCode" IS NOT NULL
      ),
      baseline AS (
        SELECT "settlementCode",
               percentile_cont(0.5) WITHIN GROUP (ORDER BY rate) AS rate
        FROM adjusted GROUP BY 1 HAVING count(*) >= ${MIN_PLACE_DEALS}
      )
      SELECT NULL::int AS "settlementCode", a.month, count(*) AS "n",
             percentile_cont(0.5) WITHIN GROUP (ORDER BY a.rate / b.rate) AS "rate"
      FROM adjusted a JOIN baseline b USING ("settlementCode")
      GROUP BY 1, 2
    `);

    const nationalSeries = toObservations(nationalMonths);

    /*
     * The base month is decided once, nationally, and every settlement inherits it.
     * Letting each town find its own would put them on different bases, and an index
     * is only useful if two of them can be compared.
     */
    const base = completeThrough(nationalSeries);
    if (!base) {
      logger.error('No complete month in the deals table — nothing to fit against.');
      process.exitCode = 1;
      return;
    }

    const dropped = nationalSeries.filter((o) => o.month > base);
    logger.log(
      `  complete through ${base}; dropping ${dropped.length} partially-reported month(s): ` +
        dropped.map((o) => `${o.month} (n=${o.n})`).join(', '),
    );

    const nationalIndex = buildIndex(nationalSeries, nationalSeries, base);

    const grouped = new Map<number, MonthRow[]>();
    for (const row of months) {
      if (row.settlementCode === null) continue;
      const at = grouped.get(row.settlementCode) ?? [];
      at.push(row);
      grouped.set(row.settlementCode, at);
    }

    const indexBySettlement: Record<string, Record<string, number>> = {};
    for (const [code, rows] of grouped) {
      const total = rows.reduce((sum, r) => sum + Number(r.n), 0);
      if (total < MIN_INDEX_DEALS) continue;

      const index = buildIndex(toObservations(rows), nationalSeries, base);
      indexBySettlement[String(code)] = Object.fromEntries(
        index.points.map((p) => [p.month, round(p.value, 5)]),
      );
    }

    logger.log(`  ${Object.keys(indexBySettlement).length} settlement indices built`);

    const params = {
      version: PARAMS_VERSION,
      fittedAt: new Date().toISOString(),
      fittedFrom: FROM,
      base,
      elasticity: { nationalB: round(nationalB, 4), byArea },
      index: {
        national: Object.fromEntries(
          nationalIndex.points.map((p) => [p.month, round(p.value, 5)]),
        ),
        bySettlement: indexBySettlement,
      },
    };

    if (dryRun) {
      logger.log('--dry-run: nothing written.');
      return;
    }

    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, `${JSON.stringify(params, null, 2)}\n`, 'utf8');
    logger.log(`Wrote ${OUT} (version ${PARAMS_VERSION}, base ${base}).`);
  } finally {
    await app.close();
  }
}

/** Monthly rows → the shape `index-series.ts` works in. */
function toObservations(rows: MonthRow[]): MonthObservation[] {
  return rows
    .map((row) => ({ month: row.month, n: Number(row.n), rate: Number(row.rate) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Hold a fitted slope inside what the method can defend.
 *
 * Wide enough on both sides to keep a surprise: the curve really does reach −0.46 at
 * 40 m² and come back to zero in the middle of the market, and a bound that only
 * allowed the textbook figure would flatten exactly the part worth having. It is
 * there for a fit that has failed, not for one that is unexpected.
 */
function bounded(b: number | null): number | null {
  if (b === null || !Number.isFinite(b)) return null;
  return Math.min(B_MAX, Math.max(B_MIN, b));
}

const round = (value: number, places: number): number =>
  Math.round(value * 10 ** places) / 10 ** places;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
