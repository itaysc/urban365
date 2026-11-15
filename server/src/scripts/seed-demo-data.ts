/**
 * Fills an agency with something to look at, from the command line.
 *
 *   npm run seed:demo                                    # the dev agency — NOT your own
 *   npm run seed:demo -- --email you@example.com         # the office that user belongs to
 *   npm run seed:demo -- --agency <id>                   # a particular one
 *   npm run seed:demo -- --email you@example.com --clear # empty it again
 *
 * What gets written depends on the office. A mortgage brokerage gets files, bank
 * offers and banker contacts. A real-estate agency gets listings. With no `--email`
 * and no `--agency` it seeds the account `seed:dev-agency` creates, which is almost
 * certainly not the one you are signed in as. It says which agency it used, because
 * the alternative is somebody staring at an empty customer list wondering why.
 * To fill the agency you are actually looking at, use the panel on its own page.
 *
 * The same service the dev-only button uses, so the two cannot drift. Refuses to run
 * against anything but a local database: inventing customers inside a real agency's
 * account is somebody's afternoon spent working out which ones are real.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { normalizeEmail } from '../auth/normalize-email.js';
import { AppModule } from '../app.module.js';
import { DemoService } from '../demo/demo.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DEV_AGENCY_EMAIL = 'dev-agency@nadlan.test';

function assertLocal(url: string | undefined): void {
  const host = url ? new URL(url).hostname : '';
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to seed demo data into a database at "${host}".`);
  }
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const logger = new Logger('SeedDemoData');

  // The app is created first because it is what loads `.env`; checking `process.env`
  // before that reads an empty environment and refuses every run, silently, which is
  // exactly the kind of failure a seed script must not have.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const prisma = app.get(PrismaService);
  const demo = app.get(DemoService);

  assertLocal(process.env.DATABASE_URL);

  // A named agency, the office of a named user, or the dev one the other seed creates.
  const emailArg = argValue('--email');
  let agencyId = argValue('--agency');

  if (!agencyId && emailArg) {
    const email = normalizeEmail(emailArg);
    const memberships = await prisma.agencyMembership.findMany({
      where: { status: 'active', user: { email } },
      select: { agencyId: true, role: true },
    });
    // Owner when they have one: that is the office the screens are read as. An agent
    // membership is the fallback, so a user who is only an agent still gets their office.
    agencyId = (memberships.find((m) => m.role === 'owner') ?? memberships[0])
      ?.agencyId;
    if (!agencyId) {
      logger.error(`No active agency for ${email}.`);
      await app.close();
      process.exit(1);
    }
  }

  if (!agencyId) {
    agencyId = (
      await prisma.agencyMembership.findFirst({
        where: { user: { email: DEV_AGENCY_EMAIL } },
        select: { agencyId: true },
      })
    )?.agencyId;
  }

  if (!agencyId) {
    logger.error(
      `No agency given and no ${DEV_AGENCY_EMAIL}. Pass --email, or run seed:dev-agency first.`,
    );
    await app.close();
    process.exit(1);
  }

  const owner = await prisma.agencyMembership.findFirst({
    where: { agencyId, role: 'owner' },
    select: { userId: true, user: { select: { email: true } } },
  });

  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { name: true, vertical: true },
  });

  // Named before the work, not after: if this is the wrong agency, the useful moment
  // to find out is now. The vertical is what decides which fixture gets written.
  logger.log(`Agency: ${agency?.name ?? agencyId} (${agencyId})`);
  logger.log(`Vertical: ${agency?.vertical ?? 'unknown'}`);
  logger.log(`Sign in as: ${owner?.user.email ?? 'unknown'}`);

  if (process.argv.includes('--clear')) {
    const cleared = await demo.clear(agencyId);
    logger.log(`Cleared: ${JSON.stringify(cleared)}`);
  } else {
    const seeded = await demo.seed(agencyId, owner?.userId ?? null);
    logger.log(`Seeded: ${JSON.stringify(seeded)}`);
    logger.log(
      agency?.vertical === 'mortgage_broker'
        ? 'Open /app/mortgage-cases, /app/banker-contacts and /app/deals.'
        : 'Open /app/radar and press חיפוש התאמות to raise the suggestions.',
    );
  }

  await app.close();
  process.exit(0);
}

// A seed script that fails without saying so is worse than one that fails loudly:
// somebody goes looking for the data it did not create.
main().catch((error: Error) => {
  new Logger('SeedDemoData').error(error.message);
  process.exit(1);
});
