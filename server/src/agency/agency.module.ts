import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { Yad2Module } from '../yad2/yad2.module.js';
import { AgencyController } from './agency.controller.js';
import { AgencyProfileController } from './agency-profile.controller.js';
import { ImagesController } from './images.controller.js';
import { AgencyService } from './agency.service.js';
import { MyListingsController } from './my-listings.controller.js';
import { MyListingsService } from './my-listings.service.js';
import { InviteController, TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

@Module({
  imports: [AuthModule, Yad2Module],
  controllers: [
    AgencyController,
    AgencyProfileController,
    ImagesController,
    MyListingsController,
    TeamController,
    InviteController,
  ],
  providers: [AgencyService, MyListingsService, TeamService],
})
export class AgencyModule {}
