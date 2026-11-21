import { Module } from '@nestjs/common';
import { GeocodeModule } from '../geocode/geocode.module.js';
import { SellerModule } from '../seller/seller.module.js';
import { ValuationModule } from '../valuation/valuation.module.js';
import { VisitorModule } from '../visitor/visitor.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { PriceCheckService } from './price-check.service.js';

@Module({
  imports: [GeocodeModule, SellerModule, ValuationModule, VisitorModule],
  controllers: [ListingsController],
  providers: [ListingsService, PriceCheckService],
  exports: [ListingsService, PriceCheckService],
})
export class ListingsModule {}
