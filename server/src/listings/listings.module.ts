import { Module } from '@nestjs/common';
import { GeocodeModule } from '../geocode/geocode.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [GeocodeModule],
  controllers: [ListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}
