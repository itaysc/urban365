import { NotFoundException } from '@nestjs/common';
import type { TenantPrismaService } from './tenant-prisma.service.js';

type Client = TenantPrismaService['client'];

/**
 * Ids a request body names as an assignee or a related row.
 *
 * RLS does not cover these: a foreign key is checked by Postgres regardless of policy,
 * so an id from another agency would be written happily — and a meeting's owner is
 * also whose Google Calendar the event is pushed to, on the owner client. Each id is
 * therefore looked up under the caller's agency first. Empty means "clear it", and is
 * left alone.
 */
export async function assertActiveMember(
  client: Client,
  agencyId: string,
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  const member = await client.agencyMembership.findFirst({
    where: { agencyId, userId, status: 'active' },
    select: { id: true },
  });
  if (!member) throw new NotFoundException('המשתמש אינו חבר בסוכנות.');
}

export async function assertCustomerIsOurs(
  client: Client,
  agencyId: string,
  customerId: string | null | undefined,
): Promise<void> {
  if (!customerId) return;
  const customer = await client.customer.findFirst({
    where: { id: customerId, agencyId },
    select: { id: true },
  });
  if (!customer) throw new NotFoundException('הלקוח לא נמצא.');
}

export async function assertListingIsOurs(
  client: Client,
  agencyId: string,
  listingId: string | null | undefined,
): Promise<void> {
  if (!listingId) return;
  const listing = await client.listing.findFirst({
    where: { id: listingId, agencyId },
    select: { id: true },
  });
  if (!listing) throw new NotFoundException('הנכס לא נמצא.');
}
