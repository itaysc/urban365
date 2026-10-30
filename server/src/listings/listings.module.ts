import { Module } from '@nestjs/common';
import { GeocodeModule } from '../geocode/geocode.module.js';
import { SellerModule } from '../seller/seller.module.js';
import { VisitorModule } from '../visitor/visitor.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [GeocodeModule, SellerModule, VisitorModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
