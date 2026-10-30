import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';
import { DealsController } from './deals.controller.js';
import { DealsService } from './deals.service.js';
import { LeadsController, PublicEnquiryController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

@Module({
  controllers: [LeadsController, PublicEnquiryController, DealsController, CustomersController],
  providers: [LeadsService, DealsService, CustomersService],
})
export class CrmModule {}
