import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Session } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { REFRESH_TOKEN_TTL_SEC } from './auth.constants.js';

export interface IssuedRefresh {
  /** `<sessionId>.<secret>` — only this ever reaches the cookie. */
  token: string;
  session: Session;
}

export class RefreshReuseError extends Error {}

const sha256 = (v: string): Buffer => createHash('sha256').update(v).digest();

/**
 * Refresh tokens as rows, no Redis.
 *
 * A login opens a family; every rotation adds a row and tombstones its predecessor. A
 * token whose row is already revoked is therefore provable reuse — someone replayed a
 * stolen token — and the whole family dies.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  private expiry(): Date {
    return new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);
  }

  /** Starts a new family. */
  async issue(userId: string, meta: { ip?: string; userAgent?: string }): Promise<IssuedRefresh> {
    return this.create(userId, randomUUID(), meta);
  }

  private async create(
    userId: string,
    familyId: string,
    meta: { ip?: string; userAgent?: string },
    impersonatingUserId?: string | null,
  ): Promise<IssuedRefresh> {
    const secret = randomBytes(48).toString('base64url');

    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(secret).toString('hex'),
        expiresAt: this.expiry(),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        impersonatingUserId: impersonatingUserId ?? null,
      },
    });

    return { token: `${session.id}.${secret}`, session };
  }

  /** The live session behind a refresh cookie, without rotating it. */
  async requireValid(presented: string): Promise<Session> {
    return this.load(presented);
  }

  async setImpersonation(sessionId: string, impersonatingUserId: string | null): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { impersonatingUserId },
    });
  }

  /**
   * Validates and rotates. Throws RefreshReuseError when a tombstoned token is replayed,
   * having first killed the family and bumped the user's session epoch.
   */
  private async load(presented: string): Promise<Session> {
    const [sessionId, secret] = presented.split('.');
    if (!sessionId || !secret) throw new Error('Malformed refresh token');

    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error('Unknown session');

    // Constant-time, and length-guarded because timingSafeEqual throws on a mismatch.
    const presentedHash = sha256(secret);
    const storedHash = Buffer.from(session.tokenHash, 'hex');
    if (presentedHash.length !== storedHash.length || !timingSafeEqual(presentedHash, storedHash)) {
      throw new Error('Refresh token does not match');
    }

    if (session.revokedAt) {
      this.logger.warn(`Refresh reuse detected on family ${session.familyId}; revoking it`);
      await this.revokeFamily(session.familyId, session.userId);
      throw new RefreshReuseError('Refresh token reuse detected');
    }

    if (session.expiresAt.getTime() <= Date.now()) throw new Error('Refresh token expired');
    return session;
  }

  async rotate(presented: string, meta: { ip?: string; userAgent?: string }): Promise<IssuedRefresh> {
    const session = await this.load(presented);

    // The next row keeps an impersonation that is still going, so a token refresh
    // in the middle of one does not silently drop the admin back into their own account.
    const next = await this.create(session.userId, session.familyId, meta, session.impersonatingUserId);

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), replacedById: next.session.id },
    });

    // Opportunistic cleanup: bounded work, no cron, and only this user's rows.
    await this.prisma.session
      .deleteMany({ where: { userId: session.userId, expiresAt: { lt: new Date() } } })
      .catch(() => undefined);

    return next;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session
      .updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  /** Reuse response, and also what "log out everywhere" does. */
  async revokeFamily(familyId: string, userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { sessionEpoch: { increment: 1 } },
      }),
    ]);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { sessionEpoch: { increment: 1 } } }),
    ]);
  }

  sessionIdOf(presented: string): string | null {
    return presented.split('.')[0] || null;
  }
}
