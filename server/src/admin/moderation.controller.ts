import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PlatformAdmin } from '../auth/decorators/roles.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { ListingApprovalService } from './listing-approval.service.js';
import { ModerationService } from './moderation.service.js';

class ApproveDto {
  @IsString() userId!: string;
}

class RejectDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class RejectListingDto {
  @IsString()
  @MinLength(1, { message: 'יש לכתוב למה הנכס לא אושר.' })
  @MaxLength(500)
  note!: string;
}

@PlatformAdmin()
@Controller('admin/moderation')
export class ModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly listings: ListingApprovalService,
  ) {}

  /** Private listings waiting because review mode is on. */
  @Get('listings')
  pendingListings() {
    return this.listings.pending();
  }

  @HttpCode(204)
  @Post('listings/:id/approve')
  async approveListing(@Param('id') id: string) {
    await this.listings.approve(id);
  }

  @HttpCode(204)
  @Post('listings/:id/reject')
  async rejectListing(@Param('id') id: string, @Body() dto: RejectListingDto) {
    await this.listings.reject(id, dto.note);
  }

  @Get('agencies')
  pending() {
    return this.moderation.pending();
  }

  @HttpCode(204)
  @Post('agencies/:id/approve')
  async approve(@Param('id') id: string, @Body() dto: ApproveDto, @CurrentUser() admin: Principal) {
    await this.moderation.approve(id, dto.userId, admin.userId);
  }

  @HttpCode(204)
  @Post('agencies/:id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectDto, @CurrentUser() admin: Principal) {
    await this.moderation.reject(id, admin.userId, dto.reason ?? 'לא אושר');
  }
}
