import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { GeocodeModule } from '../geocode/geocode.module.js';
import { MarketContextService } from './market-context.service.js';
import { ValuationController } from './valuation.controller.js';
import { PlaceService } from './place.service.js';
import { ValuationService } from './valuation.service.js';

/** הערכת שווי — the comps-based estimate. See `valuation.service.ts` for the order. */
@Module({
  imports: [PrismaModule, GeocodeModule],
  controllers: [ValuationController],
  providers: [ValuationService, MarketContextService, PlaceService],
  exports: [ValuationService],
})
export class ValuationModule {}
