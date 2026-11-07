import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { BuyListingPackageDto } from './dto/listing-package.dto.js';
import { ListingBillingService } from './listing-billing.service.js';

/**
 * The packs an agency can buy, and how many listings it can still publish from the app.
 *
 * Separate from `my/listings/:id` so "packages" is never read as a listing id.
 */
@UseGuards(TenantGuard)
@Controller('my/listing-packages')
export class ListingPackagesController {
  constructor(private readonly billing: ListingBillingService) {}

  @Get()
  summary() {
    return this.billing.summary();
  }

  @Post()
  buy(@Body() dto: BuyListingPackageDto) {
    return this.billing.purchase(dto.size);
  }
}

