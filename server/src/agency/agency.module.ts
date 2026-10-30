import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GeocodeModule } from '../geocode/geocode.module.js';
import { Yad2Module } from '../yad2/yad2.module.js';
import { AgencyController } from './agency.controller.js';
import { AgencyProfileController } from './agency-profile.controller.js';
import { ImagesController } from './images.controller.js';
import { OfficesController } from './offices.controller.js';
import { OfficesService } from './offices.service.js';
import { AgencyService } from './agency.service.js';
import { MyListingsController } from './my-listings.controller.js';
import { MyListingsService } from './my-listings.service.js';
import { InviteController, MyProfileController, TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

@Module({
  imports: [AuthModule, Yad2Module, GeocodeModule],
  controllers: [
    AgencyController,
    AgencyProfileController,
    ImagesController,
    OfficesController,
    MyListingsController,
    TeamController,
    MyProfileController,
    InviteController,
  ],
  providers: [AgencyService, MyListingsService, TeamService, OfficesService],
})
export class AgencyModule {}
