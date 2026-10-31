import { Module } from '@nestjs/common';
import { BriefingService } from './briefing.service.js';
import { DraftService } from './draft.service.js';
import { MatchScheduler } from './match.scheduler.js';
import { MatchingService } from './matching.service.js';
import { RulesService } from './rules.service.js';
import { SuggestionsController } from './matching.controller.js';
import { SuggestionsService } from './suggestions.service.js';

@Module({
  controllers: [SuggestionsController],
  providers: [
    MatchingService,
    RulesService,
    SuggestionsService,
    DraftService,
    BriefingService,
    MatchScheduler,
  ],
})
export class MatchingModule {}
