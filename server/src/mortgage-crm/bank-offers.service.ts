import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { can } from '../auth/permissions.js';
import type { CreateBankOfferDto, UpdateBankOfferDto } from './dto/bank-offer.dto.js';

/**
 * The tender result: what each bank came back with, against one case.
 *
 * RLS on `BankOffer` checks the parent case's `agencyId`, not a column of its own (see
 * the migration) — the same relationship `ListingImage` has to `Listing` — so every
 * method here first proves the case is ours, the way `assertRelationsAreOurs`
 * elsewhere proves a related row is before trusting a foreign key to it.
 */
@Injectable()
export class BankOffersService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
  ) {}

  private assertCanWrite(): void {
    if (!can(this.context.getPrincipal(), 'deal:write')) {
      throw new ForbiddenException('אין לך הרשאה לערוך הצעות בנק.');
    }
  }

  private async requireCase(caseId: string) {
    const agencyId = this.context.requireAgencyId();
    const found = await this.prisma.client.mortgageCase.findFirst({
      where: { id: caseId, agencyId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('התיק לא נמצא.');
    return found;
  }

  async list(caseId: string) {
    await this.requireCase(caseId);
    return this.prisma.client.bankOffer.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(caseId: string, dto: CreateBankOfferDto) {
    this.assertCanWrite();
    await this.requireCase(caseId);

    return this.prisma.client.bankOffer.create({
      data: {
        caseId,
        bankName: dto.bankName,
        track: dto.track,
        interestRate: dto.interestRate,
        monthlyPayment: dto.monthlyPayment,
        totalRepayment: dto.totalRepayment,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : null,
        notes: dto.notes,
      },
    });
  }

  async update(caseId: string, id: string, dto: UpdateBankOfferDto) {
    this.assertCanWrite();
    await this.requireCase(caseId);
    const existing = await this.prisma.client.bankOffer.findFirst({ where: { id, caseId } });
    if (!existing) throw new NotFoundException('ההצעה לא נמצאה.');

    return this.prisma.client.bankOffer.update({
      where: { id: existing.id },
      data: {
        ...dto,
        ...(dto.receivedAt !== undefined
          ? { receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : null }
          : {}),
      },
    });
  }

  async remove(caseId: string, id: string) {
    this.assertCanWrite();
    await this.requireCase(caseId);
    const existing = await this.prisma.client.bankOffer.findFirst({ where: { id, caseId } });
    if (!existing) throw new NotFoundException('ההצעה לא נמצאה.');

    await this.prisma.client.bankOffer.delete({ where: { id: existing.id } });
    return { deleted: true };
  }
}
