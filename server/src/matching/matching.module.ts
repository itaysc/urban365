import { Module } from '@nestjs/common';
import { MatchScheduler } from './match.scheduler.js';
import { MatchingService } from './matching.service.js';
import { SuggestionsController } from './matching.controller.js';
import { SuggestionsService } from './suggestions.service.js';

@Module({
  controllers: [SuggestionsController],
  providers: [MatchingService, SuggestionsService, MatchScheduler],
})
export class MatchingModule {}
