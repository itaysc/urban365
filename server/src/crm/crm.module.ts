import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller.js';
import { DealsService } from './deals.service.js';
import { LeadsController, PublicEnquiryController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

@Module({
  controllers: [LeadsController, PublicEnquiryController, DealsController],
  providers: [LeadsService, DealsService],
})
export class CrmModule {}
