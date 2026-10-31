/**
 * Creates a ready-to-use agency account for local development.
 *
 *   npm run seed:dev-agency
 *   npm run seed:dev-agency -- --reset   # put the password back if it was changed
 *
 * Signing up through the product is the right path for a real agency — verify the
 * email, wait for moderation — and the wrong one when you only want to look at the
 * agency screens. This writes the end state of that journey directly: a verified user,
 * an active agency, an owner membership.
 *
 * Refuses to run against anything but a local database, because the whole point of it
 * is a known password, and a known password on a reachable host is an open door.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import { normalizeEmail } from '../auth/normalize-email.js';

/**
 * Fixed rather than generated: the point of a dev account is that it is the same one
 * tomorrow. `.test` is reserved by RFC 2606 and can never be a real domain, so this
 * address cannot collide with a person's and cannot receive mail.
 */
const EMAIL = 'dev-agency@nadlan.test';
const PASSWORD = 'DevAgency!2026';
const AGENCY_NAME = 'סוכנות הדגמה';

/** Localhost only. A known password anywhere else is a vulnerability, not a fixture. */
function assertLocal(url: string | undefined): void {
  const host = url ? new URL(url).hostname : '';
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to seed a known password into a database at "${host}".`);
  }
}

async function main() {
  const logger = new Logger('SeedDevAgency');
  assertLocal(process.env.DATABASE_URL);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const prisma = app.get(PrismaService);
  const passwords = app.get(PasswordService);

  const email = normalizeEmail(EMAIL);
  const passwordHash = await passwords.hash(PASSWORD);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      firstName: 'דמו',
      lastName: 'סוכנות',
      accountType: 'agency',
      // The end state of verification, not a way around it: this account never receives
      // mail, so there is no link for it to follow.
      emailVerifiedAt: new Date(),
      // The fixture should look like an account that went through signup, and
      // signup cannot complete without agreeing.
      termsAcceptedAt: new Date(),
    },
    update: {
      // Re-run on an account that already exists: leave the password alone unless
      // asked, but always put back the two things that make it usable, since an
      // earlier run of this script may predate either column.
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      ...(process.argv.includes('--reset')
        ? { passwordHash, failedLoginCount: 0, lockedUntil: null }
        : {}),
    },
  });

  const agency = await prisma.agency.upsert({
    where: { slug: 'dev-agency' },
    create: { name: AGENCY_NAME, slug: 'dev-agency', status: 'active', contactEmail: email },
    update: {},
  });

  await prisma.agencyMembership.upsert({
    where: { userId_agencyId: { userId: user.id, agencyId: agency.id } },
    create: { userId: user.id, agencyId: agency.id, role: 'owner', status: 'active' },
    update: { role: 'owner', status: 'active' },
  });

  logger.log(`Agency "${AGENCY_NAME}" ready. Sign in as ${email} with the password in this file.`);
  await app.close();
}

await main();
