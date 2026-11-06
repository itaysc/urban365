import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthToken, AuthTokenPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const sha256 = (v: string): Buffer => createHash('sha256').update(v).digest();

export const TOKEN_TTL_SEC: Record<AuthTokenPurpose, number> = {
  email_verify: 24 * 60 * 60,
  password_reset: 2 * 60 * 60,
  agency_invite: 3 * 24 * 60 * 60,
  email_change: 24 * 60 * 60,
};

/**
 * Out-of-band tokens — verification, reset, invites — in one table with one lookup path
 * and one expiry sweep.
 *
 * Only the hash is stored, so a database leak does not hand over working reset links.
 * The reference project stores reset tokens as JWTs signed with the *session* secret and
 * verification tokens as opaque bytes; one mechanism is better than two.
 */
@Injectable()
export class AuthTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the plaintext, which only ever travels in the email. */
  async issue(userId: string, purpose: AuthTokenPurpose, meta?: object): Promise<string> {
    const secret = randomBytes(32).toString('base64url');

    // One live token per purpose: issuing a new one retires the old.
    await this.prisma.authToken.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: sha256(secret).toString('hex'),
        expiresAt: new Date(Date.now() + TOKEN_TTL_SEC[purpose] * 1000),
        meta: meta ? (meta as object) : undefined,
      },
    });

    return secret;
  }

  /**
   * Validates and marks consumed in one step, so a token cannot be used twice even if
   * two requests arrive together.
   */
  async consume(presented: string, purpose: AuthTokenPurpose): Promise<AuthToken | null> {
    const hash = sha256(presented).toString('hex');
    const token = await this.prisma.authToken.findUnique({ where: { tokenHash: hash } });

    if (!token || token.purpose !== purpose) return null;
    if (token.consumedAt) return null;
    if (token.expiresAt.getTime() <= Date.now()) return null;

    // Constant-time compare of the digests, matching the reference's reset-token handling.
    const a = sha256(presented);
    const b = Buffer.from(token.tokenHash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const { count } = await this.prisma.authToken.updateMany({
      where: { id: token.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    return count === 1 ? token : null;
  }
}
