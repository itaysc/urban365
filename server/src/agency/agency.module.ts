import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GeocodeModule } from '../geocode/geocode.module.js';
import { Yad2Module } from '../yad2/yad2.module.js';
import { AgencyController } from './agency.controller.js';
import { PublicAgenciesController } from './public-agencies.controller.js';
import { AgencyProfileController } from './agency-profile.controller.js';
import { ImagesController } from './images.controller.js';
import { OfficesController } from './offices.controller.js';
import { OfficesService } from './offices.service.js';
import { AgencyService } from './agency.service.js';
import { PublicAgenciesService } from './public-agencies.service.js';
import { OverviewController } from './overview.controller.js';
import { OverviewService } from './overview.service.js';
import { MyListingsController } from './my-listings.controller.js';
import { MyListingsService } from './my-listings.service.js';
import { ListingPackagesController } from './listing-packages.controller.js';
import { ListingBillingService } from './listing-billing.service.js';
import { InviteController, MyProfileController, TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

@Module({
  imports: [AuthModule, Yad2Module, GeocodeModule],
  controllers: [
    OverviewController,
    AgencyController,
    PublicAgenciesController,
    AgencyProfileController,
    ImagesController,
    OfficesController,
    MyListingsController,
    ListingPackagesController,
    TeamController,
    MyProfileController,
    InviteController,
  ],
  providers: [
    OverviewService,
    AgencyService,
    PublicAgenciesService,
    MyListingsService,
    ListingBillingService,
    TeamService,
    OfficesService,
  ],
})
export class AgencyModule {}
