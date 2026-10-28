import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PlatformAdmin } from '../auth/decorators/roles.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { ModerationService } from './moderation.service.js';

class ApproveDto {
  @IsString() userId!: string;
}

class RejectDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

@PlatformAdmin()
@Controller('admin/moderation')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

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
