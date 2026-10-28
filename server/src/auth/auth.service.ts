import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Agency, AgencyMembership, User } from '@prisma/client';
import { MailService } from '../mail/mail.service.js';
import {
  accountExistsTemplate,
  passwordResetTemplate,
  verifyEmailTemplate,
} from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthTokenService } from './auth-token.service.js';
import { INVALID_CREDENTIALS, LOCKOUT_MINUTES, MAX_FAILED_LOGINS } from './auth.constants.js';
import { normalizeEmail } from './normalize-email.js';
import { PasswordService } from './password.service.js';
import { RefreshReuseError, SessionService } from './session.service.js';
import { sanitizeUser, type PublicUser } from './sanitize-user.js';
import { TokenService } from './token.service.js';
import type { SignupDto } from './dto/signup.dto.js';
import type { AccessTokenClaims } from './types/principal.js';

type UserWithMembership = User & { memberships: (AgencyMembership & { agency: Agency })[] };

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly authTokens: AuthTokenService,
    private readonly mail: MailService,
  ) {}

  private include = { memberships: { include: { agency: true } }, } as const;

  private claimsFor(user: UserWithMembership): AccessTokenClaims {
    // Only an *active* membership grants an agency; a pending claim must not.
    const active = user.memberships.find((m) => m.status === 'active');

    return {
      userId: user.id,
      email: user.email,
      agencyId: active?.agencyId ?? null,
      role: active?.role ?? null,
      platformRole: user.platformRole,
      sessionEpoch: user.sessionEpoch,
    };
  }

  private async issue(user: UserWithMembership, meta: RequestMeta): Promise<AuthResult> {
    const refresh = await this.sessions.issue(user.id, meta);
    return {
      user: sanitizeUser(user),
      accessToken: this.tokens.signAccessToken(this.claimsFor(user)),
      refreshToken: refresh.token,
    };
  }

  /**
   * Creates the user plus either a brand-new agency or a claim on an existing unclaimed
   * one. The claim attaches a *pending* membership to the row that already exists —
   * nothing is merged and no listing is ever re-parented.
   */
  async signup(dto: SignupDto, meta: RequestMeta): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // The response must not confirm that an address is registered, so the person who
      // actually owns it is told out of band instead.
      const app = this.mail.appUrl;
      void this.mail.send({
        to: email,
        ...accountExistsTemplate(`${app}/login`, `${app}/forgot-password`),
      });
      throw new BadRequestException(
        'אם הכתובת הזו אינה רשומה, נשלח אליה אימייל להמשך ההרשמה.',
      );
    }

    if (!dto.claimAgencyId && !dto.agencyName?.trim()) {
      throw new BadRequestException('צריך לבחור סוכנות קיימת או להזין שם סוכנות חדשה.');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          // Stated, not left to the column default — which is `buyer`, so an agency
          // signup silently produced a consumer account.
          accountType: 'agency',
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone?.trim() || null,
        },
      });

      if (dto.claimAgencyId) {
        const agency = await tx.agency.findUnique({ where: { id: dto.claimAgencyId } });
        // `pending` is allowed as well as `unclaimed`: an agency that someone has already
        // asked for must still accept competing claims, or the first person to ask — who
        // may be a squatter — locks the real agency out until an admin intervenes. The
        // admin sees every claim side by side and approving one rejects the rest.
        if (!agency || (agency.status !== 'unclaimed' && agency.status !== 'pending')) {
          throw new BadRequestException('הסוכנות הזו אינה זמינה לשיוך.');
        }

        await tx.agencyMembership.create({
          data: { userId: created.id, agencyId: agency.id, role: 'owner', status: 'pending' },
        });
        await tx.agencyClaim.create({
          data: {
            agencyId: agency.id,
            userId: created.id,
            evidence: { signupPhone: dto.phone ?? null },
          },
        });
        if (agency.status === 'unclaimed') {
          await tx.agency.update({ where: { id: agency.id }, data: { status: 'pending' } });
        }
      } else {
        const agency = await tx.agency.create({
          data: { name: dto.agencyName!.trim(), status: 'pending', contactEmail: email },
        });
        await tx.agencyMembership.create({
          data: { userId: created.id, agencyId: agency.id, role: 'owner', status: 'pending' },
        });
      }

      return tx.user.findUniqueOrThrow({ where: { id: created.id }, include: this.include });
    });

    await this.sendVerificationEmail(user.id, email, user.firstName);
    this.logger.log(`Signed up ${email}`);
    return this.issue(user, meta);
  }

  /**
   * A consumer account. Everything the agency signup does about agencies is absent —
   * no membership, no claim, no moderation — which is the whole difference. Identity
   * still lives in `User`, so there is one login, one session family and one reset flow.
   */
  async signupBuyer(
    dto: { email: string; password: string; firstName: string; lastName: string; phone?: string },
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Same anti-enumeration answer as the agency path: the response must not confirm
      // that an address is registered, so the owner is told out of band instead.
      const app = this.mail.appUrl;
      void this.mail.send({
        to: email,
        ...accountExistsTemplate(`${app}/login`, `${app}/forgot-password`),
      });
      throw new BadRequestException('אם הכתובת הזו אינה רשומה, נשלח אליה אימייל להמשך ההרשמה.');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        accountType: 'buyer',
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || null,
        // Created eagerly here, unlike the lazy path in BuyerService: a consumer who
        // just signed up is about to use it.
        buyerProfile: { create: {} },
      },
      include: this.include,
    });

    await this.sendVerificationEmail(user.id, email, user.firstName);
    this.logger.log(`Buyer signed up ${email}`);
    return this.issue(user, meta);
  }

  async login(emailRaw: string, password: string, meta: RequestMeta): Promise<AuthResult> {
    const email = normalizeEmail(emailRaw);
    const user = await this.prisma.user.findUnique({ where: { email }, include: this.include });

    // Identical failure for unknown email and wrong password.
    if (!user) throw new UnauthorizedException(INVALID_CREDENTIALS);
    if (user.disabledAt) throw new ForbiddenException('החשבון מושבת.');

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException('החשבון ננעל זמנית בעקבות ניסיונות התחברות כושלים.');
    }

    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) {
      await this.registerFailedLogin(user);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.issue(user, meta);
  }

  /**
   * Per-account lockout, which — unlike the IP-keyed throttler — is exact and survives a
   * restart. It is the real defence against a distributed password spray.
   */
  private async registerFailedLogin(user: User): Promise<void> {
    const count = user.failedLoginCount + 1;
    const locked = count >= MAX_FAILED_LOGINS;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: locked ? 0 : count,
        lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
      },
    });

    if (locked) this.logger.warn(`Locked ${user.email} after ${MAX_FAILED_LOGINS} failed logins`);
  }

  async refresh(presented: string, meta: RequestMeta): Promise<AuthResult> {
    let rotated;
    try {
      rotated = await this.sessions.rotate(presented, meta);
    } catch (e) {
      if (e instanceof RefreshReuseError) {
        throw new UnauthorizedException('ההתחברות אופסה מטעמי אבטחה. יש להתחבר מחדש.');
      }
      throw new UnauthorizedException('ההתחברות פגה. יש להתחבר מחדש.');
    }

    // Sessions cascade with the user, so a missing row here means the account went
    // between the rotation and this read. Same answer: the session is dead.
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.session.userId },
      include: this.include,
    });

    if (!user) throw new UnauthorizedException('ההתחברות פגה. יש להתחבר מחדש.');

    return {
      user: sanitizeUser(user),
      accessToken: this.tokens.signAccessToken(this.claimsFor(user)),
      refreshToken: rotated.token,
    };
  }

  async logout(presented: string | undefined): Promise<void> {
    const sessionId = presented ? this.sessions.sessionIdOf(presented) : null;
    if (sessionId) await this.sessions.revoke(sessionId);
  }

  async logoutEverywhere(userId: string): Promise<void> {
    await this.sessions.revokeAllForUser(userId);
  }

  private async sendVerificationEmail(userId: string, email: string, firstName: string): Promise<void> {
    const token = await this.authTokens.issue(userId, 'email_verify');
    const link = `${this.mail.apiUrl}/api/v1/auth/email-verification/redirect?token=${token}`;
    await this.mail.send({ to: email, ...verifyEmailTemplate(link, firstName) });
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('ההתחברות פגה. יש להתחבר מחדש.');
    if (user.emailVerifiedAt) return;
    await this.sendVerificationEmail(user.id, user.email, user.firstName);
  }

  /** Returns false for an invalid, expired or already-used token. */
  async verifyEmail(token: string): Promise<boolean> {
    const consumed = await this.authTokens.consume(token, 'email_verify');
    if (!consumed) return false;

    await this.prisma.user.update({
      where: { id: consumed.userId },
      data: { emailVerifiedAt: new Date() },
    });
    return true;
  }

  /**
   * Always resolves the same way whether or not the address exists — the response is the
   * one place an attacker could otherwise enumerate accounts.
   */
  async forgotPassword(emailRaw: string): Promise<void> {
    const email = normalizeEmail(emailRaw);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.disabledAt) return;

    const token = await this.authTokens.issue(user.id, 'password_reset');
    const link = `${this.mail.apiUrl}/api/v1/auth/password-reset/redirect?token=${token}`;
    await this.mail.send({ to: email, ...passwordResetTemplate(link, user.firstName) });
  }

  /**
   * Resetting a password drops every existing session: if the reset was prompted by a
   * compromise, leaving the attacker logged in defeats the point.
   */
  async resetPassword(token: string, password: string): Promise<boolean> {
    const consumed = await this.authTokens.consume(token, 'password_reset');
    if (!consumed) return false;

    const passwordHash = await this.passwords.hash(password);
    await this.prisma.user.update({
      where: { id: consumed.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await this.sessions.revokeAllForUser(consumed.userId);

    this.logger.log(`Password reset for user ${consumed.userId}`);
    return true;
  }

  async me(userId: string): Promise<PublicUser> {
    // Not findUniqueOrThrow. The id comes from a signed token, and a token stays
    // cryptographically valid until it expires even if the account is deleted in the
    // meantime — so the row genuinely may be gone. Throwing Prisma's P2025 turned that
    // into a 500; it is a dead session, which is a 401, and the client already knows
    // how to clear state and send the person to the login page on one.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: this.include,
    });

    if (!user) throw new UnauthorizedException('ההתחברות פגה. יש להתחבר מחדש.');
    return sanitizeUser(user);
  }
}
