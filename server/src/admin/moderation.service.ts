import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AgencyVerticalValue } from '../auth/agency-vertical.js';
import { MailService } from '../mail/mail.service.js';
import { claimDecisionTemplate } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ManagedAgency {
  id: string;
  name: string;
  status: string;
  yad2Id: string | null;
  publishedCount: number;
}

/** What an admin can set an account to. Admin wins over the account type when both are set. */
export type ManagedUserRole = 'buyer' | 'agency' | 'admin';

export interface ManagedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  emailVerified: boolean;
  disabled: boolean;
  publishedCount: number;
  role: ManagedUserRole;
  /** The office they currently belong to, when they have one. */
  agencyName: string | null;
  agencyId: string | null;
  /** Which CRM shell that office sees. Null along with `agencyName` when there is none. */
  agencyVertical: string | null;
}

export interface PendingAgency {
  id: string;
  name: string;
  status: string;
  yad2Id: string | null;
  listingCount: number;
  createdAt: string;
  claims: {
    id: string;
    userId: string;
    userEmail: string;
    userName: string;
    evidence: unknown;
    createdAt: string;
  }[];
  /** Set for a self-signup agency, which has a pending owner but no claim row. */
  pendingOwner: { userId: string; email: string; name: string } | null;
}

function roleOf(person: { platformRole: string | null; accountType: string }): ManagedUserRole {
  if (person.platformRole === 'admin') return 'admin';
  return person.accountType === 'agency' ? 'agency' : 'buyer';
}

/**
 * The queue a platform admin works through. Approving attaches the *existing* agency row
 * to the claimant — nothing is merged and no listing is ever re-parented.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async pending(): Promise<PendingAgency[]> {
    const agencies = await this.prisma.agency.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { listings: true } },
        claims: {
          where: { status: 'pending' },
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        },
        memberships: {
          where: { status: 'pending', role: 'owner' },
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        },
      },
    });

    return agencies.map((a) => {
      const owner = a.memberships[0]?.user;
      return {
        id: a.id,
        name: a.name,
        status: a.status,
        yad2Id: a.yad2Id,
        listingCount: a._count.listings,
        createdAt: a.createdAt.toISOString(),
        claims: a.claims.map((c) => ({
          id: c.id,
          userId: c.user.id,
          userEmail: c.user.email,
          userName: `${c.user.firstName} ${c.user.lastName}`.trim(),
          evidence: c.evidence,
          createdAt: c.createdAt.toISOString(),
        })),
        pendingOwner:
          a.claims.length === 0 && owner
            ? { userId: owner.id, email: owner.email, name: `${owner.firstName} ${owner.lastName}`.trim() }
            : null,
      };
    });
  }

  /**
   * Activates the agency and one membership. Competing claims on the same agency are
   * rejected in the same transaction, so two people can never both end up owners.
   */
  async approve(agencyId: string, userId: string, adminId: string): Promise<void> {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('הסוכנות לא נמצאה.');
    if (agency.status !== 'pending') throw new BadRequestException('הסוכנות אינה ממתינה לאישור.');

    const membership = await this.prisma.agencyMembership.findUnique({
      where: { userId_agencyId: { userId, agencyId } },
    });
    if (!membership) throw new BadRequestException('למשתמש הזה אין בקשה לסוכנות הזו.');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.agency.update({
        where: { id: agencyId },
        data: { status: 'active', reviewedAt: now, reviewedById: adminId, rejectionReason: null },
      }),
      this.prisma.agencyMembership.update({
        where: { id: membership.id },
        data: { status: 'active', joinedAt: now },
      }),
      this.prisma.agencyClaim.updateMany({
        where: { agencyId, userId, status: 'pending' },
        data: { status: 'approved', reviewedAt: now, reviewedById: adminId },
      }),
      // Everyone else who asked for this agency loses.
      this.prisma.agencyClaim.updateMany({
        where: { agencyId, status: 'pending', NOT: { userId } },
        data: {
          status: 'rejected',
          reviewedAt: now,
          reviewedById: adminId,
          rejectionReason: 'הסוכנות שויכה למבקש אחר',
        },
      }),
      this.prisma.agencyMembership.updateMany({
        where: { agencyId, status: 'pending', NOT: { userId } },
        data: { status: 'suspended' },
      }),
    ]);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      void this.mail.send({
        to: user.email,
        ...claimDecisionTemplate(true, agency.name, `${this.mail.appUrl}/app`),
      });
    }

    this.logger.log(`Agency ${agencyId} approved for user ${userId} by ${adminId}`);
  }

  async reject(agencyId: string, adminId: string, reason: string): Promise<void> {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      include: { memberships: { include: { user: true } } },
    });
    if (!agency) throw new NotFoundException('הסוכנות לא נמצאה.');

    const now = new Date();
    // A scraped agency goes back to unclaimed so someone else can ask for it later; an
    // agency invented at signup has nothing to go back to and stays rejected.
    const nextStatus = agency.yad2Id ? 'unclaimed' : 'rejected';

    await this.prisma.$transaction([
      this.prisma.agency.update({
        where: { id: agencyId },
        data: { status: nextStatus, reviewedAt: now, reviewedById: adminId, rejectionReason: reason },
      }),
      this.prisma.agencyClaim.updateMany({
        where: { agencyId, status: 'pending' },
        data: { status: 'rejected', reviewedAt: now, reviewedById: adminId, rejectionReason: reason },
      }),
      this.prisma.agencyMembership.updateMany({
        where: { agencyId, status: 'pending' },
        data: { status: 'suspended' },
      }),
    ]);

    for (const m of agency.memberships) {
      void this.mail.send({
        to: m.user.email,
        ...claimDecisionTemplate(false, agency.name, this.mail.appUrl),
      });
    }

    this.logger.log(`Agency ${agencyId} rejected by ${adminId}: ${reason}`);
  }

  /**
   * Agencies an admin can suspend or remove.
   *
   * Pending ones are the queue above this list. With no search, only the ones that
   * already have an account or a suspension — an unclaimed scrape is found by name,
   * or the list would be every office in the country.
   */
  async directory(q?: string): Promise<ManagedAgency[]> {
    const term = q?.trim();
    const agencies = await this.prisma.agency.findMany({
      where: {
        status: { in: term ? ['active', 'unclaimed', 'suspended', 'deleted'] : ['active', 'suspended', 'deleted'] },
        ...(term ? { name: { contains: term, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 50,
      include: { _count: { select: { listings: { where: { status: 'published' } } } } },
    });

    return agencies.map((agency) => ({
      id: agency.id,
      name: agency.name,
      status: agency.status,
      yad2Id: agency.yad2Id,
      publishedCount: agency._count.listings,
    }));
  }

  async suspend(agencyId: string, adminId: string): Promise<void> {
    const agency = await this.requireManageable(agencyId);
    if (agency.status === 'suspended') throw new BadRequestException('הסוכנות כבר מושעית.');

    await this.prisma.agency.update({
      where: { id: agencyId },
      data: { status: 'suspended', reviewedAt: new Date(), reviewedById: adminId },
    });
    this.logger.log(`Agency ${agencyId} suspended by ${adminId}`);
  }

  /**
   * Back to what it was. An office that has a working member becomes active again;
   * a scrape nobody claimed goes back to unclaimed.
   */
  async restore(agencyId: string, adminId: string): Promise<void> {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('הסוכנות לא נמצאה.');
    if (agency.status === 'deleted') {
      await this.restoreDeleted(agencyId, adminId);
      return;
    }
    if (agency.status !== 'suspended') throw new BadRequestException('הסוכנות אינה מושעית.');

    const member = await this.prisma.agencyMembership.findFirst({
      where: { agencyId, status: 'active' },
      select: { id: true },
    });

    await this.prisma.agency.update({
      where: { id: agencyId },
      data: {
        status: member ? 'active' : 'unclaimed',
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });
    this.logger.log(`Agency ${agencyId} restored by ${adminId}`);
  }

  /**
   * Reclassifies an office between the real-estate and mortgage-broker CRM shells.
   *
   * Unlike `setRole`, this signs nobody out and resets no session: the vertical only
   * decides which nav items and case types an agency sees, not what it is allowed to
   * do, so there is nothing a stale token would get wrong by not knowing it yet. Data
   * from the old vertical — listings for an office switched to mortgage, mortgage
   * cases for one switched back — is left exactly as it is; this moves the sign on
   * the door, not the filing cabinets behind it.
   */
  async setAgencyVertical(agencyId: string, adminId: string, vertical: AgencyVerticalValue): Promise<void> {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('הסוכנות לא נמצאה.');
    if (agency.vertical === vertical) return;

    await this.prisma.agency.update({ where: { id: agencyId }, data: { vertical } });
    this.logger.log(`Agency ${agencyId} set to vertical ${vertical} by ${adminId}`);
  }

  /**
   * The agency leaves the site. Its listings are marked removed rather than deleted,
   * which is what keeps them out of search, and the people in it lose the agency on
   * their next sign-in.
   */
  async remove(agencyId: string, adminId: string): Promise<void> {
    await this.requireManageable(agencyId);
    const now = new Date();
    const members = await this.prisma.agencyMembership.findMany({
      where: { agencyId },
      select: { userId: true },
    });

    await this.prisma.$transaction([
      this.prisma.listing.updateMany({
        where: { agencyId, status: 'published' },
        data: { status: 'removed', removedAt: now, removalReason: 'agency', delistedAt: now },
      }),
      this.prisma.agencyMembership.updateMany({
        where: { agencyId, status: { not: 'suspended' } },
        data: { status: 'suspended' },
      }),
      this.prisma.agency.update({
        where: { id: agencyId },
        data: { status: 'deleted', reviewedAt: now, reviewedById: adminId },
      }),
      ...(members.length > 0
        ? [
            this.prisma.user.updateMany({
              where: { id: { in: members.map((member) => member.userId) } },
              data: { sessionEpoch: { increment: 1 } },
            }),
          ]
        : []),
    ]);

    this.logger.log(`Agency ${agencyId} deleted by ${adminId}`);
  }

  /**
   * Puts back a deleted agency and the listings that were taken down with it.
   *
   * A listing the agency removed itself — sold, rented, a change of mind — keeps
   * its own reason and stays hidden. Only rows marked `agency` were ours to hide.
   */
  private async restoreDeleted(agencyId: string, adminId: string): Promise<void> {
    const member = await this.prisma.agencyMembership.findFirst({
      where: { agencyId },
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.listing.updateMany({
        where: { agencyId, status: 'removed', removalReason: 'agency' },
        data: { status: 'published', removedAt: null, removalReason: null, delistedAt: null },
      }),
      this.prisma.agencyMembership.updateMany({
        where: { agencyId, status: 'suspended' },
        data: { status: 'active' },
      }),
      this.prisma.agency.update({
        where: { id: agencyId },
        data: {
          status: member ? 'active' : 'unclaimed',
          reviewedAt: new Date(),
          reviewedById: adminId,
        },
      }),
    ]);

    this.logger.log(`Agency ${agencyId} restored after deletion by ${adminId}`);
  }

  /**
   * Every account, newest first.
   *
   * A term matches the email or either name. The role is what the admin can change:
   * a platform admin is shown as an admin even when the account also belongs to an agency.
   */
  async users(q?: string): Promise<ManagedUser[]> {
    const term = q?.trim();
    const people = await this.prisma.user.findMany({
      where: term
        ? {
            OR: [
              { email: { contains: term, mode: 'insensitive' } },
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        memberships: {
          where: { status: 'active' },
          take: 1,
          select: { agency: { select: { id: true, name: true, vertical: true } } },
        },
        _count: {
          select: { createdListings: { where: { status: 'published', agencyId: null } } },
        },
      },
    });

    return people.map((person) => ({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      phone: person.phone,
      createdAt: person.createdAt,
      lastLoginAt: person.lastLoginAt,
      emailVerified: person.emailVerifiedAt !== null,
      disabled: person.disabledAt !== null,
      publishedCount: person._count.createdListings,
      role: roleOf(person),
      agencyName: person.memberships[0]?.agency.name ?? null,
      agencyId: person.memberships[0]?.agency.id ?? null,
      agencyVertical: person.memberships[0]?.agency.vertical ?? null,
    }));
  }

  /**
   * Changes what the account is for, and signs them out so the next login carries it.
   *
   * An admin cannot take the admin role off their own account: that is the only door
   * into this page. Becoming an agency does not invent an office — without one, the
   * next sign-in asks them to connect one.
   */
  async setRole(userId: string, adminId: string, role: ManagedUserRole): Promise<void> {
    const person = await this.requireUser(userId);
    if (userId === adminId && role !== 'admin') {
      throw new BadRequestException('אי אפשר להסיר את הרשאת המנהל מהחשבון שלך.');
    }
    if (roleOf(person) === role) return;

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(role === 'admin'
            ? { platformRole: 'admin' }
            : { accountType: role, platformRole: null }),
          sessionEpoch: { increment: 1 },
        },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      ...(role === 'buyer'
        ? [
            this.prisma.buyerProfile.upsert({
              where: { userId },
              create: { userId },
              update: {},
            }),
          ]
        : []),
    ]);

    this.logger.log(`User ${userId} set to ${role} by ${adminId}`);
  }

  /** Blocks sign-in and hides the listings this person published. */
  async disableUser(userId: string, adminId: string): Promise<void> {
    if (userId === adminId) throw new BadRequestException('אי אפשר להשבית את החשבון שלך.');
    const person = await this.requireUser(userId);
    if (person.disabledAt) throw new BadRequestException('החשבון כבר מושבת.');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { disabledAt: now, sessionEpoch: { increment: 1 } },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    this.logger.log(`User ${userId} disabled by ${adminId}`);
  }

  async enableUser(userId: string, adminId: string): Promise<void> {
    const person = await this.requireUser(userId);
    if (!person.disabledAt) throw new BadRequestException('החשבון אינו מושבת.');

    await this.prisma.user.update({ where: { id: userId }, data: { disabledAt: null } });
    this.logger.log(`User ${userId} enabled by ${adminId}`);
  }

  private async requireUser(userId: string) {
    const person = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!person) throw new NotFoundException('המשתמש לא נמצא.');
    return person;
  }

  private async requireManageable(agencyId: string) {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency || agency.status === 'deleted') throw new NotFoundException('הסוכנות לא נמצאה.');
    return agency;
  }
}
