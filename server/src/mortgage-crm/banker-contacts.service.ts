import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { can } from '../auth/permissions.js';
import type { CreateBankerContactDto, UpdateBankerContactDto } from './dto/banker-contact.dto.js';

/**
 * The personal contacts at a bank an advisor actually calls — a directory, not a
 * pipeline, so there is no stage and no assignee scope: everyone at the agency sees
 * the same Rolodex.
 */
@Injectable()
export class BankerContactsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
  ) {}

  // The same permission `Customer` writes use: anybody who can work the inbox can
  // keep the contacts they call from it.
  private assertCanWrite(): void {
    if (!can(this.context.getPrincipal(), 'lead:write')) {
      throw new ForbiddenException('אין לך הרשאה לערוך אנשי קשר בבנקים.');
    }
  }

  async list() {
    const agencyId = this.context.requireAgencyId();
    return this.prisma.client.bankerContact.findMany({
      where: { agencyId, deletedAt: null },
      orderBy: [{ bankName: 'asc' }, { name: 'asc' }],
    });
  }

  /** Contacts removed from the directory, newest removal first. */
  async archive() {
    const agencyId = this.context.requireAgencyId();
    return this.prisma.client.bankerContact.findMany({
      where: { agencyId, deletedAt: { not: null } },
      orderBy: [{ deletedAt: 'desc' }],
    });
  }

  async create(dto: CreateBankerContactDto) {
    this.assertCanWrite();
    return this.prisma.client.bankerContact.create({
      data: { agencyId: this.context.requireAgencyId(), ...dto },
    });
  }

  async update(id: string, dto: UpdateBankerContactDto) {
    this.assertCanWrite();
    const existing = await this.requireOwn(id);
    return this.prisma.client.bankerContact.update({ where: { id: existing.id }, data: dto });
  }

  /** Archives the contact rather than destroying it — see `restore`. */
  async remove(id: string) {
    this.assertCanWrite();
    const existing = await this.requireOwn(id);
    await this.prisma.client.bankerContact.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }

  /** Puts a removed contact back in the directory. */
  async restore(id: string) {
    this.assertCanWrite();
    const agencyId = this.context.requireAgencyId();
    const existing = await this.prisma.client.bankerContact.findFirst({
      where: { id, agencyId, deletedAt: { not: null } },
    });
    if (!existing) throw new NotFoundException('איש הקשר לא נמצא בארכיון.');

    return this.prisma.client.bankerContact.update({
      where: { id: existing.id },
      data: { deletedAt: null },
    });
  }

  private async requireOwn(id: string) {
    const agencyId = this.context.requireAgencyId();
    const found = await this.prisma.client.bankerContact.findFirst({
      where: { id, agencyId, deletedAt: null },
    });
    if (!found) throw new NotFoundException('איש הקשר לא נמצא.');
    return found;
  }
}
