import { Injectable, NotFoundException } from '@nestjs/common';
import { listingPath } from '../seo/listing-slug.js';
import { MailService } from '../mail/mail.service.js';
import { listingDecisionTemplate } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

const QUEUE = {
  id: true,
  city: true,
  street: true,
  houseNumber: true,
  neighborhood: true,
  price: true,
  rooms: true,
  squareMeter: true,
  propertyType: true,
  section: true,
  description: true,
  coverImageUrl: true,
  createdAt: true,
  reviewStatus: true,
  reviewReason: true,
  owner: { select: { email: true, firstName: true, lastName: true } },
} as const;

/**
 * Private listings held because review mode is on.
 *
 * An agency listing never lands here: publishing one does not set `approval` to
 * pending. Approving is what first puts the row on the site, and the email is the
 * only notice the owner gets.
 */
@Injectable()
export class ListingApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async pending() {
    const rows = await this.prisma.listing.findMany({
      where: { approval: 'pending', ownerUserId: { not: null }, status: { not: 'removed' } },
      orderBy: { updatedAt: 'desc' },
      select: QUEUE,
    });

    return rows.flatMap((row) => {
      if (!row.owner) return [];
      return [
        {
          ...row,
          owner: row.owner,
          description: row.description ? row.description.slice(0, 400) : null,
          createdAt: row.createdAt.toISOString(),
        },
      ];
    });
  }

  async approve(id: string) {
    const listing = await this.requirePending(id);
    const now = new Date();

    await this.prisma.listing.update({
      where: { id },
      data: {
        status: 'published',
        delistedAt: null,
        publishedAt: listing.publishedAt ?? now,
        // A person's approval overrides the spam check, which would otherwise keep
        // the page out of the sitemap.
        reviewStatus: 'clean',
        approval: 'approved',
        rejectionNote: null,
        decidedAt: now,
      },
    });

    const address = this.address(listing);
    const link = `${this.mail.appUrl}${listingPath(listing.id, listing)}`;
    await this.mail.send({
      to: listing.owner.email,
      ...listingDecisionTemplate({
        approved: true,
        firstName: listing.owner.firstName,
        address,
        link,
      }),
    });
  }

  async reject(id: string, note: string) {
    const listing = await this.requirePending(id);
    const text = note.trim();

    await this.prisma.listing.update({
      where: { id },
      data: {
        status: 'draft',
        delistedAt: new Date(),
        approval: 'rejected',
        rejectionNote: text,
        decidedAt: new Date(),
      },
    });

    await this.mail.send({
      to: listing.owner.email,
      ...listingDecisionTemplate({
        approved: false,
        firstName: listing.owner.firstName,
        address: this.address(listing),
        note: text,
      }),
    });
  }

  private async requirePending(id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, approval: 'pending', ownerUserId: { not: null }, status: { not: 'removed' } },
      select: {
        id: true,
        publishedAt: true,
        city: true,
        street: true,
        houseNumber: true,
        neighborhood: true,
        owner: { select: { email: true, firstName: true } },
      },
    });

    if (!listing?.owner) throw new NotFoundException('הנכס לא נמצא בתור.');
    return { ...listing, owner: listing.owner };
  }

  private address(listing: { street: string | null; houseNumber: number | null; city: string | null }) {
    const line = [[listing.street, listing.houseNumber].filter(Boolean).join(' '), listing.city]
      .filter(Boolean)
      .join(', ');
    return line || 'הנכס שפרסמת';
  }
}
