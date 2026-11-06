import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AgencyRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { agencyInviteTemplate, removedFromAgencyTemplate } from '../mail/templates.js';
import { PasswordService } from '../auth/password.service.js';
import { StorageService } from '../storage/storage.service.js';
import { userAvatarUrl } from './image-url.js';
import { normalizeEmail } from '../auth/normalize-email.js';
import { can } from '../auth/permissions.js';
import type { AcceptInviteDto, AgencyRoleValue, UpdateMyProfileDto } from './dto/team.dto.js';

const sha256 = (v: string): Buffer => createHash('sha256').update(v).digest();
const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const ROLE_LABEL: Record<AgencyRole, string> = { owner: 'בעלים', agent: 'סוכן' };

export interface InvitePreview {
  email: string;
  role: AgencyRole;
  agencyName: string;
  /** True when the address already has an account, so the page asks them to sign in. */
  hasAccount: boolean;
}

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    /**
     * Invites are looked up by token before anyone is authenticated, and accepting one
     * writes a User row — neither can run on the tenant client.
     */
    private readonly owner: PrismaService,
    private readonly context: RequestContextService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
  ) {}

  private assertCanManage(): void {
    if (!can(this.context.getPrincipal(), 'team:manage')) {
      throw new ForbiddenException('רק בעלים של הסוכנות יכול לנהל את הצוות.');
    }
  }

  /** Members and outstanding invites, which is what the team screen shows. */
  async list() {
    const agencyId = this.context.requireAgencyId();

    const [members, invites] = await Promise.all([
      // The OWNER client, deliberately. `User` is enabled-with-no-policy — invisible to
      // the tenant role — and a Prisma query extension never fires for a nested read, so
      // on the tenant client every `user` here came back null rather than erroring. The
      // agency is still pinned explicitly, from the verified token.
      this.owner.agencyMembership.findMany({
        where: { agencyId },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          role: true,
          status: true,
          joinedAt: true,
          createdAt: true,
          user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
        },
      }),
      this.prisma.client.agencyInvite.findMany({
        where: { agencyId, acceptedAt: null, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      }),
    ]);

    const now = Date.now();
    return {
      members,
      // Expiry is computed rather than stored as a status, so a row never disagrees
      // with the clock.
      invites: invites.map((i) => ({ ...i, expired: i.expiresAt.getTime() <= now })),
    };
  }

  async invite(emailRaw: string, role: AgencyRoleValue = 'agent') {
    this.assertCanManage();

    const agencyId = this.context.requireAgencyId();
    const principal = this.context.getPrincipal()!;
    const email = normalizeEmail(emailRaw);

    // Already on the team — including a pending membership, which an invite would
    // duplicate rather than resolve. Owner client for the same reason as `list()`: this
    // filters on `user.email`, and on the tenant client that join matches nothing, so
    // the guard silently passed and re-invited existing members.
    const existingMember = await this.owner.agencyMembership.findFirst({
      where: { agencyId, user: { email } },
      select: { id: true },
    });
    if (existingMember) throw new BadRequestException('המשתמש כבר חבר בסוכנות.');

    const secret = randomBytes(32).toString('base64url');

    // One live invite per address: re-inviting replaces the previous link rather than
    // leaving two valid ones in two different inboxes.
    await this.prisma.client.agencyInvite.updateMany({
      where: { agencyId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const invite = await this.prisma.client.agencyInvite.create({
      data: {
        agencyId,
        email,
        role,
        invitedById: principal.userId,
        tokenHash: sha256(secret).toString('hex'),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });

    const agency = await this.prisma.client.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: { name: true },
    });
    const inviter = await this.owner.user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { firstName: true, lastName: true },
    });

    void this.mail.send({
      to: email,
      ...agencyInviteTemplate(
        `${this.mail.appUrl}/accept-invite?token=${encodeURIComponent(secret)}`,
        agency.name,
        `${inviter.firstName} ${inviter.lastName}`.trim(),
        ROLE_LABEL[role],
      ),
    });

    this.logger.log(`Invited ${email} to agency ${agencyId}`);
    return { ...invite, expired: false };
  }

  async revokeInvite(id: string) {
    this.assertCanManage();
    const agencyId = this.context.requireAgencyId();

    const { count } = await this.prisma.client.agencyInvite.updateMany({
      where: { id, agencyId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) throw new NotFoundException('ההזמנה לא נמצאה.');
    return { revoked: true };
  }

  // ── accepting ───────────────────────────────────────────────────────────────

  /** Looked up before sign-in, so it reveals only what the accept page must show. */
  async preview(token: string): Promise<InvitePreview> {
    const invite = await this.findUsableInvite(token);

    const [agency, user] = await Promise.all([
      this.owner.agency.findUniqueOrThrow({ where: { id: invite.agencyId }, select: { name: true } }),
      this.owner.user.findUnique({ where: { email: invite.email }, select: { id: true } }),
    ]);

    return {
      email: invite.email,
      role: invite.role,
      agencyName: agency.name,
      hasAccount: Boolean(user),
    };
  }

  /**
   * Accepting both proves control of the address and grants access, so the membership is
   * created `active` and the email counts as verified — the link only ever reached that
   * inbox.
   *
   * `currentUserId` is set when the request arrives with a session. It must belong to
   * the invited address: a signed-in user must not be able to redirect someone else's
   * invitation to their own account.
   */
  async accept(token: string, dto: AcceptInviteDto, currentUserId?: string) {
    const invite = await this.findUsableInvite(token);

    const existing = await this.owner.user.findUnique({ where: { email: invite.email } });

    if (existing) {
      if (currentUserId && currentUserId !== existing.id) {
        throw new ForbiddenException('ההזמנה נשלחה לכתובת אחרת. צריך להתחבר עם אותה כתובת.');
      }
      if (!currentUserId) {
        // A password here would be a second login path with its own lockout and
        // throttling story; the client is told to sign in and come back instead.
        throw new BadRequestException({
          code: 'invite_requires_login',
          message: 'כבר קיים חשבון עם הכתובת הזו. התחבר/י כדי להצטרף לצוות.',
        });
      }

      await this.assertNoOtherAgency(existing.id, invite.agencyId);

      return this.owner.$transaction(async (tx) => {
        await tx.agencyMembership.upsert({
          where: { userId_agencyId: { userId: existing.id, agencyId: invite.agencyId } },
          create: {
            userId: existing.id,
            agencyId: invite.agencyId,
            role: invite.role,
            status: 'active',
            invitedById: invite.invitedById,
            joinedAt: new Date(),
          },
          update: { status: 'active', role: invite.role, joinedAt: new Date() },
        });

        await tx.agencyInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });

        // The access token they are holding says they have no agency. Bumping the epoch
        // forces the next refresh to mint a new one rather than leaving them with a
        // dashboard that 403s until the token expires.
        await tx.user.update({
          where: { id: existing.id },
          data: {
            sessionEpoch: { increment: 1 },
            emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
            // A buyer who accepts an agency invitation is now both. The type records
            // what the account is *for*, and their BuyerProfile is untouched — an agent
            // looking for their own home keeps their shortlist.
            accountType: 'agency',
          },
        });

        return { userId: existing.id, created: false };
      });
    }

    if (!dto.password || !dto.firstName?.trim() || !dto.lastName?.trim()) {
      throw new BadRequestException('צריך למלא שם פרטי, שם משפחה וסיסמה.');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    return this.owner.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invite.email,
          passwordHash,
          // Joining a team by invitation is the other way to become agency staff.
          accountType: 'agency',
          firstName: dto.firstName!.trim(),
          lastName: dto.lastName!.trim(),
          phone: dto.phone?.trim() || null,
          // Receiving the link is itself proof of control over the address.
          emailVerifiedAt: new Date(),
        },
      });

      await tx.agencyMembership.create({
        data: {
          userId: user.id,
          agencyId: invite.agencyId,
          role: invite.role,
          status: 'active',
          invitedById: invite.invitedById,
          joinedAt: new Date(),
        },
      });

      await tx.agencyInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

      this.logger.log(`${invite.email} joined agency ${invite.agencyId} by invite`);
      return { userId: user.id, created: true };
    });
  }

  // ── members ─────────────────────────────────────────────────────────────────

  async changeRole(membershipId: string, role: AgencyRoleValue) {
    this.assertCanManage();
    const agencyId = this.context.requireAgencyId();
    const principal = this.context.getPrincipal()!;

    const membership = await this.requireMembership(membershipId, agencyId);

    if (membership.userId === principal.userId) {
      throw new BadRequestException('אי אפשר לשנות את התפקיד של עצמך.');
    }
    if (membership.role === 'owner' && role !== 'owner') {
      await this.assertNotLastOwner(agencyId, membership.id);
    }

    return this.prisma.client.agencyMembership.update({
      where: { id: membership.id },
      data: { role },
      select: { id: true, role: true, status: true },
    });
  }

  async removeMember(membershipId: string) {
    this.assertCanManage();
    const agencyId = this.context.requireAgencyId();
    const principal = this.context.getPrincipal()!;

    const membership = await this.requireMembership(membershipId, agencyId);

    if (membership.userId === principal.userId) {
      throw new BadRequestException('אי אפשר להסיר את עצמך מהסוכנות.');
    }
    if (membership.role === 'owner') await this.assertNotLastOwner(agencyId, membership.id);

    const [user, agency] = await Promise.all([
      this.owner.user.findUniqueOrThrow({
        where: { id: membership.userId },
        select: { email: true },
      }),
      this.prisma.client.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { name: true } }),
    ]);

    await this.prisma.client.agencyMembership.delete({ where: { id: membership.id } });

    // Their access token still names this agency. Without the bump they keep tenant
    // access until it expires — up to the full access-token lifetime.
    await this.owner.user.update({
      where: { id: membership.userId },
      data: { sessionEpoch: { increment: 1 } },
    });

    void this.mail.send({ to: user.email, ...removedFromAgencyTemplate(agency.name) });
    return { removed: true };
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private async requireMembership(id: string, agencyId: string) {
    const membership = await this.prisma.client.agencyMembership.findFirst({
      where: { id, agencyId },
      select: { id: true, userId: true, role: true },
    });

    if (!membership) throw new NotFoundException('החבר לא נמצא.');
    return membership;
  }

  /** An agency with no owner cannot be administered by anyone. */
  private async assertNotLastOwner(agencyId: string, excludingId: string): Promise<void> {
    const owners = await this.prisma.client.agencyMembership.count({
      where: { agencyId, role: 'owner', status: 'active', id: { not: excludingId } },
    });

    if (owners === 0) {
      throw new BadRequestException('חייב להישאר לפחות בעלים אחד בסוכנות.');
    }
  }

  /**
   * Multi-agency membership is deferred: the access token carries a single agency, and
   * `claimsFor` picks the first active one. Silently creating a second would make which
   * agency someone lands in depend on row order, so it is refused with a clear message.
   */
  private async assertNoOtherAgency(userId: string, agencyId: string): Promise<void> {
    const other = await this.owner.agencyMembership.findFirst({
      where: { userId, status: 'active', agencyId: { not: agencyId } },
      select: { id: true },
    });

    if (other) {
      throw new BadRequestException('החשבון כבר משויך לסוכנות אחרת.');
    }
  }

  private async findUsableInvite(token: string) {
    const presented = sha256(token);
    const invite = await this.owner.agencyInvite.findUnique({
      where: { tokenHash: presented.toString('hex') },
    });

    const invalid = new NotFoundException('ההזמנה אינה תקפה או שפג תוקפה.');
    if (!invite) throw invalid;

    // Constant-time compare of the digests, matching how auth tokens are checked.
    const stored = Buffer.from(invite.tokenHash, 'hex');
    if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) throw invalid;

    if (invite.acceptedAt || invite.revokedAt) throw invalid;
    if (invite.expiresAt.getTime() <= Date.now()) throw invalid;

    return invite;
  }

  /**
   * A member editing their own record. No role check — this is theirs — but it writes
   * on the owner client, because `User` is invisible to the tenant role, and the id
   * comes from the verified token rather than the request body.
   */
  async updateOwnProfile(userId: string, dto: UpdateMyProfileDto) {
    const phone = dto.phone?.trim();

    return this.owner.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName?.trim() ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName?.trim() ? { lastName: dto.lastName.trim() } : {}),
        // An empty string is how the client clears it; undefined means "not sent".
        ...(dto.phone !== undefined ? { phone: phone || null } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio.trim() || null } : {}),
        ...(dto.dailyBriefing !== undefined ? { dailyBriefing: dto.dailyBriefing } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        bio: true,
        dailyBriefing: true,
      },
    });
  }

  /** Replaces the signed-in member's profile picture. Anyone may change their own. */
  async setOwnAvatar(userId: string, file: { buffer: Buffer }) {
    if (!file?.buffer?.length) throw new BadRequestException('לא התקבל קובץ.');

    const contentType = this.storage.detectImageType(file.buffer);
    if (!contentType || !this.storage.extensionFor(contentType)) {
      throw new BadRequestException('הקובץ אינו תמונה נתמכת.');
    }

    const existing = await this.owner.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarStorageKey: true },
    });

    const storageKey = await this.storage.putObject(`avatars/${userId}`, file.buffer, contentType);

    const updated = await this.owner.user.update({
      where: { id: userId },
      // The `v=` stamp changes with each upload, so a replaced picture is not hidden
      // behind the cached response for the old one.
      data: { avatarStorageKey: storageKey, avatarUrl: userAvatarUrl(userId, Date.now().toString(36)) },
      select: { id: true, avatarUrl: true },
    });

    // Only once the new one is recorded, so a failed upload never leaves them with none.
    if (existing.avatarStorageKey) await this.storage.deleteObject(existing.avatarStorageKey);
    return updated;
  }

  async removeOwnAvatar(userId: string) {
    const existing = await this.owner.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarStorageKey: true },
    });

    const updated = await this.owner.user.update({
      where: { id: userId },
      data: { avatarUrl: null, avatarStorageKey: null },
      select: { id: true, avatarUrl: true },
    });

    if (existing.avatarStorageKey) await this.storage.deleteObject(existing.avatarStorageKey);
    return updated;
  }

  /** Bytes for the public avatar route. */
  async readAvatar(userId: string) {
    const user = await this.owner.user.findUnique({
      where: { id: userId },
      select: { avatarStorageKey: true },
    });

    if (!user?.avatarStorageKey) throw new NotFoundException('אין תמונת פרופיל.');
    return this.storage.getObject(user.avatarStorageKey);
  }
}
