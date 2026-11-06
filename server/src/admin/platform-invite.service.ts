import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MailService } from '../mail/mail.service.js';
import { userInviteTemplate } from '../mail/templates.js';
import { PasswordService } from '../auth/password.service.js';
import { normalizeEmail } from '../auth/normalize-email.js';
import { PrismaService } from '../prisma/prisma.service.js';

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();
const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export interface PlatformInvitePreview {
  email: string;
  /** True when the address already has an account, so the page sends them to sign in. */
  hasAccount: boolean;
}

@Injectable()
export class PlatformInviteService {
  private readonly logger = new Logger(PlatformInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
  ) {}

  /** Outstanding invitations. Accepted and revoked ones are done. */
  async list() {
    const invites = await this.prisma.platformInvite.findMany({
      where: { acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, accountType: true, expiresAt: true, createdAt: true },
    });

    const now = Date.now();
    return invites.map((invite) => ({ ...invite, expired: invite.expiresAt.getTime() <= now }));
  }

  async invite(emailRaw: string, accountType: 'buyer' | 'agency', invitedById: string) {
    const email = normalizeEmail(emailRaw);

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new BadRequestException('כבר קיים חשבון עם הכתובת הזו.');

    const secret = randomBytes(32).toString('base64url');

    // One live invite per address. Sending again replaces the previous link.
    await this.prisma.platformInvite.updateMany({
      where: { email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const invite = await this.prisma.platformInvite.create({
      data: {
        email,
        accountType,
        invitedById,
        tokenHash: sha256(secret).toString('hex'),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: { id: true, email: true, accountType: true, expiresAt: true, createdAt: true },
    });

    const inviter = await this.prisma.user.findUniqueOrThrow({
      where: { id: invitedById },
      select: { firstName: true, lastName: true },
    });

    void this.mail.send({
      to: email,
      ...userInviteTemplate(
        `${this.mail.appUrl}/join?token=${encodeURIComponent(secret)}`,
        `${inviter.firstName} ${inviter.lastName}`.trim() || 'Urban365',
        accountType === 'agency' ? 'סוכנות' : 'משתמש',
      ),
    });

    this.logger.log(`Platform invite sent to ${email}`);
    return { ...invite, expired: false };
  }

  async revoke(id: string) {
    const { count } = await this.prisma.platformInvite.updateMany({
      where: { id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('ההזמנה לא נמצאה.');
    return { revoked: true };
  }

  async preview(token: string): Promise<PlatformInvitePreview> {
    const invite = await this.findUsable(token);
    const user = await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });
    return { email: invite.email, hasAccount: Boolean(user) };
  }

  /**
   * Creates a buyer account. No agency, no membership — this is a person using the
   * site, which is the whole difference from a team invite.
   */
  async accept(
    token: string,
    dto: { firstName: string; lastName: string; password: string; phone?: string },
  ): Promise<string> {
    const invite = await this.findUsable(token);

    const existing = await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('כבר קיים חשבון עם הכתובת הזו. התחבר/י.');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: invite.email,
          passwordHash,
          accountType: invite.accountType,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone?.trim() || null,
          // The link only reached this inbox, which is the verification.
          emailVerifiedAt: new Date(),
          termsAcceptedAt: new Date(),
          // A regular user keeps a buyer profile. An agency does not get one until
          // they are actually searching for a home of their own.
          ...(invite.accountType === 'buyer' ? { buyerProfile: { create: {} } } : {}),
        },
        select: { id: true },
      });

      await tx.platformInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return created;
    });

    this.logger.log(`${invite.email} joined by platform invite`);
    return user.id;
  }

  private async findUsable(token: string) {
    const presented = sha256(token);
    const invite = await this.prisma.platformInvite.findUnique({
      where: { tokenHash: presented.toString('hex') },
    });

    const invalid = new NotFoundException('ההזמנה אינה תקפה או שפג תוקפה.');
    if (!invite) throw invalid;

    const stored = Buffer.from(invite.tokenHash, 'hex');
    if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) throw invalid;
    if (invite.acceptedAt || invite.revokedAt) throw invalid;
    if (invite.expiresAt.getTime() <= Date.now()) throw invalid;

    return invite;
  }
}
