import { Module } from '@nestjs/common';
import { AgencyController } from './agency.controller.js';
import { AgencyProfileController } from './agency-profile.controller.js';
import { AgencyService } from './agency.service.js';
import { MyListingsController } from './my-listings.controller.js';
import { MyListingsService } from './my-listings.service.js';

@Module({
  controllers: [AgencyController, AgencyProfileController, MyListingsController],
  providers: [AgencyService, MyListingsService],
})
export class AgencyModule {}
