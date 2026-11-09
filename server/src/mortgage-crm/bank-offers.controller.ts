import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { BankOffersService } from './bank-offers.service.js';
import { CreateBankOfferDto, UpdateBankOfferDto } from './dto/bank-offer.dto.js';

/** The competing bank offers logged against one mortgage case. */
@UseGuards(TenantGuard)
@Controller('my/mortgage-cases/:caseId/offers')
export class BankOffersController {
  constructor(private readonly offers: BankOffersService) {}

  @Get()
  list(@Param('caseId') caseId: string) {
    return this.offers.list(caseId);
  }

  @Post()
  create(@Param('caseId') caseId: string, @Body() dto: CreateBankOfferDto) {
    return this.offers.create(caseId, dto);
  }

  @Patch(':id')
  update(@Param('caseId') caseId: string, @Param('id') id: string, @Body() dto: UpdateBankOfferDto) {
    return this.offers.update(caseId, id, dto);
  }

  @Delete(':id')
  remove(@Param('caseId') caseId: string, @Param('id') id: string) {
    return this.offers.remove(caseId, id);
  }
}
