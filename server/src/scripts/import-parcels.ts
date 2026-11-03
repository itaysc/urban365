/**
 * Imports the Survey of Israel cadastral parcels layer into `Parcel`.
 *
 *   npm run import:parcels -- ~/Downloads/parcel_all/PARCEL_ALL
 *   npm run import:parcels -- <base> --limit 50000
 *
 * Give it the path without an extension; `.shp` and `.dbf` are read together. The
 * layer is ~1.1 million parcels and the file is 1.1 GB, so this streams and commits
 * in batches rather than holding anything.
 *
 * The source is in Israel TM Grid, not degrees. Everything is converted on the way in
 * so that one coordinate system — WGS84, the same as city boundaries and listing
 * coordinates — leaves the importer.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module.js';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { itmToWgs84 } from '../cadastre/israel-tm.js';
import { boundsOf, cellOf, centroidOf } from '../cadastre/parcel-index.js';
import { readShapefile } from '../cadastre/shapefile.js';

const BATCH = 2_000;
/** Six decimals is about 11 cm — far finer than the layer, and much smaller to store. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

async function main() {
  const logger = new Logger('ImportParcels');
  const args = process.argv.slice(2);
  const base = args.find((a) => !a.startsWith('--'));
  const limitArg = args.indexOf('--limit');
  const limit = limitArg === -1 ? Infinity : Number(args[limitArg + 1]);

  if (!base) {
    logger.error('Usage: npm run import:parcels -- <path to PARCEL_ALL without extension>');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);

  let read = 0;
  let written = 0;
  let skipped = 0;
  let batch: Prisma.ParcelCreateManyInput[] = [];
  const started = Date.now();

  const flush = async () => {
    if (batch.length === 0) return;
    /*
     * `skipDuplicates`, unlike the deals sync: a parcel is geometry, the same gush
     * and chelka can legitimately appear twice in the layer as separate polygons, and
     * the first is as good as the second. Re-importing a newer layer should drop the
     * table first rather than merge two vintages.
     */
    await prisma.parcel.createMany({ data: batch, skipDuplicates: true });
    written += batch.length;
    batch = [];
  };

  try {
    logger.log(`Reading ${base}.shp — this takes a few minutes.`);

    for await (const record of readShapefile(base)) {
      read += 1;
      if (read > limit) break;

      const gush = Number(record.attributes.GUSH_NUM);
      const chelka = Number(record.attributes.PARCEL);

      if (!Number.isFinite(gush) || !Number.isFinite(chelka) || gush <= 0 || chelka <= 0) {
        skipped += 1;
        continue;
      }

      // Only the outer ring. Parcels with holes are rare, our point-in-polygon tests
      // outer rings only, and keeping the rest would store geometry nothing reads.
      const outer = record.rings[0];
      if (!outer || outer.length < 4) {
        skipped += 1;
        continue;
      }

      const ring = outer.map(([x, y]) => {
        const point = itmToWgs84(x, y);
        return [round(point.longitude), round(point.latitude)];
      });

      const geometry = { type: 'Polygon', coordinates: [ring] };
      const bounds = boundsOf(geometry);
      if (!bounds) {
        skipped += 1;
        continue;
      }

      const middle = centroidOf(bounds);
      batch.push({
        gush,
        chelka,
        ...bounds,
        ...cellOf(middle.latitude, middle.longitude),
        geometry,
      });

      if (batch.length >= BATCH) {
        await flush();
        if (written % 100_000 === 0) {
          const rate = Math.round(read / ((Date.now() - started) / 1000));
          logger.log(`${written.toLocaleString()} parcels written (${rate}/s)`);
        }
      }
    }

    await flush();

    const seconds = Math.round((Date.now() - started) / 1000);
    logger.log(
      `Done in ${seconds}s: ${read.toLocaleString()} read, ${written.toLocaleString()} written, ` +
        `${skipped.toLocaleString()} skipped.`,
    );
    logger.log(`Parcel table now holds ${(await prisma.parcel.count()).toLocaleString()} rows.`);
  } finally {
    await app.close();
  }
}

void main();
