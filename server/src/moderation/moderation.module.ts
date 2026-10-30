import { Module } from '@nestjs/common';
import { ListingReviewService } from './listing-review.service.js';

@Module({
  providers: [ListingReviewService],
  exports: [ListingReviewService],
})
export class ModerationModule {}
