import { Module } from '@nestjs/common';
import { GeocodeModule } from '../geocode/geocode.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { SellerListingsController } from './seller-listings.controller.js';
import { SellerListingsService } from './seller-listings.service.js';
import { SellerStatsService } from './seller-stats.service.js';
import { EngagementService } from './engagement.service.js';

@Module({
  imports: [GeocodeModule, StorageModule, ModerationModule],
  controllers: [SellerListingsController],
  providers: [SellerListingsService, SellerStatsService, EngagementService],
  exports: [SellerListingsService, EngagementService],
})
export class SellerModule {}
