import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { MatchingService } from './matching.service.js';
import { SuggestionsService } from './suggestions.service.js';
import { RequestContextService } from '../tenancy/request-context.service.js';

class SaveDraftDto {
  /** `''` clears it, which is how an agent throws a draft away. */
  @IsString() @MaxLength(2000) draft!: string;
}

class ListSuggestionsQuery {
  /** A user id, or `'all'` for the team. Absent means your own and the unclaimed. */
  @IsOptional() @IsString() ownerId?: string;
}

/** The radar: what the system thinks is worth doing, and what was done about it. */
@UseGuards(TenantGuard)
@Controller('my/suggestions')
export class SuggestionsController {
  constructor(
    private readonly suggestions: SuggestionsService,
    private readonly matching: MatchingService,
    private readonly context: RequestContextService,
  ) {}

  @Get()
  list(@Query() query: ListSuggestionsQuery) {
    return this.suggestions.list(query.ownerId);
  }

  /**
   * Run the match now rather than waiting for tonight.
   *
   * Here because the first thing anybody does after filling in a brief is want to know
   * what it found, and "come back tomorrow" is the wrong answer to that. Scoped to the
   * caller's own agency — the sweep's other callers are the timer, which does all of
   * them.
   */
  @Post('refresh')
  async refresh() {
    const raised = await this.matching.sweepAgency(this.context.requireAgencyId());
    return { raised };
  }

  /** Write the message. Nothing is sent — the draft comes back for a person to use. */
  @Post(':id/draft')
  draft(@Param('id') id: string) {
    return this.suggestions.draft(id);
  }

  /** Keep what the agent made of it. */
  @Post(':id/draft/save')
  saveDraft(@Param('id') id: string, @Body() dto: SaveDraftDto) {
    return this.suggestions.saveDraft(id, dto.draft);
  }

  @Post(':id/done')
  done(@Param('id') id: string) {
    return this.suggestions.markDone(id);
  }

  @Post(':id/dismiss')
  dismiss(@Param('id') id: string) {
    return this.suggestions.dismiss(id);
  }
}
