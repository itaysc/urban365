import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { ManagedUserRole } from './moderation.service.js';
import { AGENCY_VERTICALS, type AgencyVerticalValue } from '../auth/agency-vertical.js';
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

class SetRoleDto {
  @IsIn(['buyer', 'agency', 'admin'])
  role!: ManagedUserRole;
}

class SetVerticalDto {
  @IsIn(AGENCY_VERTICALS)
  vertical!: AgencyVerticalValue;
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

  /** Every account, so a role can be changed and not only a private seller disabled. */
  @Get('users')
  users(@Query('q') q?: string) {
    return this.moderation.users(q);
  }

  @HttpCode(204)
  @Post('users/:id/role')
  async setRole(@Param('id') id: string, @Body() dto: SetRoleDto, @CurrentUser() admin: Principal) {
    await this.moderation.setRole(id, admin.userId, dto.role);
  }

  @HttpCode(204)
  @Post('users/:id/disable')
  async disableUser(@Param('id') id: string, @CurrentUser() admin: Principal) {
    await this.moderation.disableUser(id, admin.userId);
  }

  @HttpCode(204)
  @Post('users/:id/enable')
  async enableUser(@Param('id') id: string, @CurrentUser() admin: Principal) {
    await this.moderation.enableUser(id, admin.userId);
  }

  @Get('agencies')
  pending() {
    return this.moderation.pending();
  }

  /** Active, suspended, and — when a name is given — unclaimed agencies. */
  @Get('agencies/directory')
  directory(@Query('q') q?: string) {
    return this.moderation.directory(q);
  }

  @HttpCode(204)
  @Post('agencies/:id/vertical')
  async setVertical(@Param('id') id: string, @Body() dto: SetVerticalDto, @CurrentUser() admin: Principal) {
    await this.moderation.setAgencyVertical(id, admin.userId, dto.vertical);
  }

  @HttpCode(204)
  @Post('agencies/:id/suspend')
  async suspend(@Param('id') id: string, @CurrentUser() admin: Principal) {
    await this.moderation.suspend(id, admin.userId);
  }

  @HttpCode(204)
  @Post('agencies/:id/restore')
  async restore(@Param('id') id: string, @CurrentUser() admin: Principal) {
    await this.moderation.restore(id, admin.userId);
  }

  @HttpCode(204)
  @Post('agencies/:id/delete')
  async remove(@Param('id') id: string, @CurrentUser() admin: Principal) {
    await this.moderation.remove(id, admin.userId);
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
