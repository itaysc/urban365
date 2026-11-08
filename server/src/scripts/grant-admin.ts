/**
 * Grants or revokes platform-admin on a user.
 *
 * The same switch lives on ניהול משתמשים. This remains for the case where no admin
 * can sign in yet — the role that reaches the scraper and the moderation queue.
 *
 *   npm run grant:admin -- someone@example.com
 *   npm run grant:admin -- someone@example.com --revoke
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail } from '../auth/normalize-email.js';

async function main() {
  const logger = new Logger('GrantAdmin');
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const revoke = args.includes('--revoke');

  if (!email) {
    logger.error('Usage: npm run grant:admin -- <email> [--revoke]');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const prisma = app.get(PrismaService);

  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (!user) {
    logger.error(`No user with email ${normalized}. Sign up first, then run this.`);
    process.exitCode = 1;
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { platformRole: revoke ? null : 'admin' },
    });
    // Existing access tokens still carry the old role for up to 15 minutes, so drop
    // their sessions and make them log in again.
    await prisma.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
    await prisma.user.update({ where: { id: user.id }, data: { sessionEpoch: { increment: 1 } } });

    logger.log(`${revoke ? 'Revoked' : 'Granted'} platform admin for ${normalized}. Log in again.`);
  }

  await app.close();
}

await main();
