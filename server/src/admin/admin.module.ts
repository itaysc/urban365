import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { JoinController, PlatformInviteController } from './platform-invite.controller.js';
import { PlatformInviteService } from './platform-invite.service.js';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ModerationController, PlatformInviteController, JoinController],
  providers: [ModerationService, PlatformInviteService],
})
export class AdminModule {}
