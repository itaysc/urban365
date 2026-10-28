import { Module } from '@nestjs/common';
import { AgencyController } from './agency.controller.js';
import { AgencyService } from './agency.service.js';
import { MyListingsController } from './my-listings.controller.js';

@Module({
  controllers: [AgencyController, MyListingsController],
  providers: [AgencyService],
})
export class AgencyModule {}
