import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AgencyVerticalValue } from '../auth/agency-vertical.js';
import { MailService } from '../mail/mail.service.js';
import { claimDecisionTemplate } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { parseAgencyInput } from '../yad2/yad2.transform.js';

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

/** An office kept off the site until someone there agrees, with what was imported for it. */
export interface DraftAgency {
  id: string;
  name: string;
  status: string;
  yad2Id: string | null;
  phone: string | null;
  draftCount: number;
  /** The private page the office is sent. Null until the preview import has run. */
  previewPath: string | null;
  lastImportedAt: string | null;
}

export interface DraftListing {
  id: string;
  section: string;
  price: number | null;
  rooms: number | null;
  squareMeter: number | null;
  floor: number | null;
  propertyType: string | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  houseNumber: number | null;
  listingUrl: string | null;
  updatedAt: string;
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
    private readonly storage: StorageService,
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
      ...this.publishImported(agencyId, now),
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

  /** Offices nobody has claimed or been approved for yet, that have listings waiting as drafts. */
  async draftAgencies(): Promise<DraftAgency[]> {
    const drafts = { status: 'draft' as const };
    const agencies = await this.prisma.agency.findMany({
      where: { status: { in: ['unclaimed', 'pending'] }, listings: { some: drafts } },
      orderBy: { name: 'asc' },
      include: { _count: { select: { listings: { where: drafts } } } },
    });
    const latest = await this.prisma.listing.groupBy({
      by: ['agencyId'],
      where: { ...drafts, agencyId: { in: agencies.map((agency) => agency.id) } },
      _max: { updatedAt: true },
    });
    const importedAt = new Map(latest.map((row) => [row.agencyId, row._max.updatedAt]));

    return agencies.map((agency) => ({
      id: agency.id,
      name: agency.name,
      status: agency.status,
      yad2Id: agency.yad2Id,
      phone: agency.phone,
      draftCount: agency._count.listings,
      previewPath: agency.previewToken ? `/preview/${agency.previewToken}` : null,
      lastImportedAt: importedAt.get(agency.id)?.toISOString() ?? null,
    }));
  }

  async draftListings(agencyId: string): Promise<DraftListing[]> {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId }, select: { id: true } });
    if (!agency) throw new NotFoundException('הסוכנות לא נמצאה.');

    const listings = await this.prisma.listing.findMany({
      where: { agencyId, status: 'draft' },
      orderBy: [{ section: 'asc' }, { price: { sort: 'desc', nulls: 'last' } }],
      select: {
        id: true,
        section: true,
        price: true,
        rooms: true,
        squareMeter: true,
        floor: true,
        propertyType: true,
        city: true,
        neighborhood: true,
        street: true,
        houseNumber: true,
        listingUrl: true,
        updatedAt: true,
      },
    });
    return listings.map((listing) => ({ ...listing, updatedAt: listing.updatedAt.toISOString() }));
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
   * Drops the link to a yad2 page. The office, its people and the listings already
   * imported stay. The yad2 id is freed, so another office can connect that page,
   * and the imported rows lose the token a later scrape would match on — otherwise
   * that scrape would take the listings back.
   */
  async unlinkYad2(agencyId: string, adminId: string): Promise<void> {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('הסוכנות לא נמצאה.');
    if (!agency.yad2Id) throw new BadRequestException('הסוכנות אינה מקושרת ליד2.');

    await this.prisma.$transaction([
      this.prisma.listing.updateMany({
        where: { agencyId, token: { not: null } },
        data: { token: null },
      }),
      this.prisma.agency.update({
        where: { id: agencyId },
        data: { yad2Id: null },
      }),
    ]);

    this.logger.log(`Agency ${agencyId} unlinked from yad2 ${agency.yad2Id} by ${adminId}`);
  }

  /**
   * Points an office at a yad2 page. The id is only a link: listings are not imported
   * here. An id another office already holds is refused, because two rows cannot share it.
   */
  async linkYad2(agencyId: string, adminId: string, input: string): Promise<void> {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('הסוכנות לא נמצאה.');
    if (agency.yad2Id) throw new BadRequestException('הסוכנות כבר מקושרת לעמוד יד2. נתקו אותו קודם.');

    let yad2Id: string;
    try {
      yad2Id = parseAgencyInput(input).agencyId;
    } catch {
      throw new BadRequestException('לא הצלחנו לקרוא מספר סוכנות. הזינו מספר או קישור ליד2.');
    }

    const taken = await this.prisma.agency.findUnique({
      where: { yad2Id },
      select: { name: true },
    });
    if (taken) throw new BadRequestException(`עמוד היד2 הזה כבר משויך ל${taken.name}.`);

    try {
      await this.prisma.agency.update({ where: { id: agencyId }, data: { yad2Id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('עמוד היד2 הזה כבר משויך לסוכנות אחרת.');
      }
      throw error;
    }
    this.logger.log(`Agency ${agencyId} linked to yad2 ${yad2Id} by ${adminId}`);
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

  /**
   * Puts an agency account into an office as an active owner, and signs them out so
   * the next login carries that office.
   *
   * An office that was still waiting, unclaimed or turned down becomes active: an
   * admin attaching someone is the approval. A suspended or deleted office is left
   * alone. Someone who already belongs to a different office is refused — the token
   * can only name one.
   */
  async assignToAgency(userId: string, agencyId: string, adminId: string): Promise<void> {
    const person = await this.requireUser(userId);
    if (person.accountType !== 'agency') {
      throw new BadRequestException('אפשר לשייך רק חשבון סוכנות.');
    }

    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('הסוכנות לא נמצאה.');
    if (agency.status === 'deleted') throw new BadRequestException('הסוכנות נמחקה.');
    if (agency.status === 'suspended') {
      throw new BadRequestException('הסוכנות מושעית. בטלו את ההשעיה קודם.');
    }

    const elsewhere = await this.prisma.agencyMembership.findFirst({
      where: { userId, status: 'active', agencyId: { not: agencyId } },
      select: { id: true },
    });
    if (elsewhere) throw new BadRequestException('החשבון כבר משויך לסוכנות אחרת.');

    const now = new Date();
    const activating = agency.status !== 'active';
    await this.prisma.$transaction([
      this.prisma.agencyMembership.upsert({
        where: { userId_agencyId: { userId, agencyId } },
        create: { userId, agencyId, role: 'owner', status: 'active', joinedAt: now },
        update: { role: 'owner', status: 'active', joinedAt: now },
      }),
      ...(activating
        ? [
            this.prisma.agency.update({
              where: { id: agencyId },
              data: { status: 'active', reviewedAt: now, reviewedById: adminId, rejectionReason: null },
            }),
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
            ...this.publishImported(agencyId, now),
          ]
        : []),
      this.prisma.agencyClaim.updateMany({
        where: { agencyId, userId, status: 'pending' },
        data: { status: 'approved', reviewedAt: now, reviewedById: adminId },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { sessionEpoch: { increment: 1 } },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    this.logger.log(`User ${userId} assigned to agency ${agencyId} by ${adminId}`);
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

  /**
   * Removes the account. Private listings and the enquiries on them go with it;
   * an office they belonged to keeps its customers, deals and agency listings, with
   * this person unassigned. The acting admin cannot delete their own account — it is
   * the only door into this page.
   */
  async deleteUser(userId: string, adminId: string): Promise<void> {
    if (userId === adminId) throw new BadRequestException('אי אפשר למחוק את החשבון שלך.');

    const person = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatarStorageKey: true,
        ownedListings: { select: { images: { select: { storageKey: true } } } },
      },
    });
    if (!person) throw new NotFoundException('המשתמש לא נמצא.');

    const saves = await this.prisma.savedListing.findMany({
      where: { profile: { userId } },
      select: { listingId: true },
    });
    const savesByListing = new Map<string, number>();
    for (const row of saves) {
      savesByListing.set(row.listingId, (savesByListing.get(row.listingId) ?? 0) + 1);
    }

    const savedListingIds = [...savesByListing.keys()];
    await this.prisma.$transaction([
      // Heart counts are denormalised. Dropping the shortlist without this leaves
      // every listing they saved showing a heart that no longer has a person behind it.
      ...[...savesByListing.entries()].map(([id, count]) =>
        this.prisma.listing.updateMany({
          where: { id },
          data: { savedCount: { decrement: count } },
        }),
      ),
      ...(savedListingIds.length > 0
        ? [
            this.prisma.listing.updateMany({
              where: { id: { in: savedListingIds }, savedCount: { lt: 0 } },
              data: { savedCount: 0 },
            }),
          ]
        : []),
      // A session points at the next one in its rotation. Clearing that link first
      // lets the cascade delete the family without the chain holding a row back.
      this.prisma.session.updateMany({ where: { userId }, data: { replacedById: null } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    const storageKeys = [
      person.avatarStorageKey,
      ...person.ownedListings.flatMap((listing) => listing.images.map((image) => image.storageKey)),
    ].filter((key): key is string => key !== null);
    await Promise.all(storageKeys.map((key) => this.storage.deleteObject(key)));

    this.logger.log(`User ${userId} deleted by ${adminId}`);
  }

  /**
   * What was imported for the office while nobody there had agreed, put on the site
   * now that someone has. Drafts the office wrote itself are not touched.
   */
  private publishImported(agencyId: string, now: Date) {
    const imported = { agencyId, source: 'yad2' as const, status: 'draft' as const };
    return [
      this.prisma.listing.updateMany({
        where: { ...imported, publishedAt: null },
        data: { publishedAt: now },
      }),
      this.prisma.listing.updateMany({ where: imported, data: { status: 'published' } }),
    ];
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
