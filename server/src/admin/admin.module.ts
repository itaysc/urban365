import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  AdminUsersController,
  JoinController,
  PlatformInviteController,
} from './platform-invite.controller.js';
import { PlatformInviteService } from './platform-invite.service.js';
import { ListingApprovalService } from './listing-approval.service.js';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ModerationController, PlatformInviteController, AdminUsersController, JoinController],
  providers: [ModerationService, PlatformInviteService, ListingApprovalService],
})
export class AdminModule {}
