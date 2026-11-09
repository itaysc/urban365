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
      where: { agencyId },
      orderBy: [{ bankName: 'asc' }, { name: 'asc' }],
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

  async remove(id: string) {
    this.assertCanWrite();
    const existing = await this.requireOwn(id);
    await this.prisma.client.bankerContact.delete({ where: { id: existing.id } });
    return { deleted: true };
  }

  private async requireOwn(id: string) {
    const agencyId = this.context.requireAgencyId();
    const found = await this.prisma.client.bankerContact.findFirst({ where: { id, agencyId } });
    if (!found) throw new NotFoundException('איש הקשר לא נמצא.');
    return found;
  }
}
