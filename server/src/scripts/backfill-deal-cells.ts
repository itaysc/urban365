/**
 * Fills `MarketDeal.cellLat` / `cellLng` for rows written before the columns existed.
 *
 *   npm run backfill:deal-cells
 *
 * New rows get their cell from `cellOf` in the sync's write path. This is only for the
 * 3.18M already in the table, and it does the arithmetic in SQL because doing it a row
 * at a time through the client would take an hour to compute two integers.
 *
 * SQL and TypeScript computing the same thing is exactly the drift this would otherwise
 * introduce, so the script finishes by sampling real rows and checking the two agree.
 * A mismatch is silent in production — every comp query would simply find nothing.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CELL_DEGREES, cellOf } from '../cadastre/parcel-index.js';

const BATCH = 200_000;

async function main() {
  const logger = new Logger('BackfillDealCells');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);

  try {
    const started = Date.now();
    let total = 0;

    for (;;) {
      /*
       * `floor(x / CELL_DEGREES)` — the same expression as `cellOf`, and the sample
       * check below is what holds the two honest. Batched by id so each statement is
       * its own transaction and a long one cannot block the sync.
       */
      const updated = await prisma.$executeRaw`
        UPDATE "MarketDeal" SET
          "cellLat" = floor("latitude" / ${CELL_DEGREES})::int,
          "cellLng" = floor("longitude" / ${CELL_DEGREES})::int
        WHERE "id" IN (
          SELECT "id" FROM "MarketDeal"
          WHERE "cellLat" IS NULL AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL
          LIMIT ${BATCH}
        )`;

      if (updated === 0) break;
      total += updated;
      logger.log(`${total.toLocaleString()} rows filled`);
    }

    logger.log(`Done in ${Math.round((Date.now() - started) / 1000)}s: ${total.toLocaleString()} rows.`);

    // The check that matters: does the SQL agree with the function the lookup uses?
    const sample = await prisma.marketDeal.findMany({
      where: { cellLat: { not: null } },
      select: { id: true, latitude: true, longitude: true, cellLat: true, cellLng: true },
      take: 2_000,
      orderBy: { id: 'asc' },
    });

    const wrong = sample.filter((row) => {
      const expected = cellOf(row.latitude!, row.longitude!);
      return expected.cellLat !== row.cellLat || expected.cellLng !== row.cellLng;
    });

    if (wrong.length > 0) {
      logger.error(
        `${wrong.length} of ${sample.length} sampled rows disagree with cellOf(). ` +
          'The SQL and the TypeScript have drifted — comp lookups will silently find nothing.',
      );
      process.exitCode = 1;
      return;
    }

    logger.log(`Verified ${sample.length} rows against cellOf(); they agree.`);

    const missing = await prisma.marketDeal.count({
      where: { cellLat: null, latitude: { not: null } },
    });
    if (missing > 0) logger.warn(`${missing} rows still have no cell.`);
  } finally {
    await app.close();
  }
}

void main();
