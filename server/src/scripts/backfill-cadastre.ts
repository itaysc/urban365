/**
 * Stamps listings with the cadastral block and parcel they sit on.
 *
 *   npm run backfill:cadastre              # up to 500, one a second
 *   npm run backfill:cadastre -- --limit 50
 *   npm run backfill:cadastre -- --retry   # try the ones GovMap could not place again
 *   npm run backfill:cadastre -- --status
 *
 * Gush and chelka are the only key that joins our listings to the national
 * transaction registry — the registry records a location as settlement plus parcel
 * and holds no street addresses at all. Without this, our listings and the country's
 * sale prices cannot be put in the same query.
 *
 * Paced at one GovMap request a second, so a few hundred listings is a few minutes.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module.js';
import { CadastreBackfill } from '../cadastre/cadastre.backfill.js';

async function main() {
  const logger = new Logger('BackfillCadastre');
  const args = process.argv.slice(2);

  const limitArg = args.indexOf('--limit');
  const limit = limitArg === -1 ? 500 : Number(args[limitArg + 1]);
  const retry = args.includes('--retry');

  if (!Number.isFinite(limit) || limit <= 0) {
    logger.error('--limit needs a positive number');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const backfill = app.get(CadastreBackfill);

  try {
    const before = await backfill.remaining();
    logger.log(
      `${before.withParcel} listings already placed, ${before.waiting} waiting, ` +
        `${before.unplaceable} GovMap could not place.`,
    );

    if (args.includes('--status')) return;

    await backfill.run(limit, retry);

    const after = await backfill.remaining();
    logger.log(
      `Now ${after.withParcel} placed, ${after.waiting} still waiting.` +
        (after.waiting > 0 ? ' Run again to continue.' : ''),
    );
  } finally {
    await app.close();
  }
}

void main();
