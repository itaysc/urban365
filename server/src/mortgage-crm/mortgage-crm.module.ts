import { Module } from '@nestjs/common';
import { BankOffersController } from './bank-offers.controller.js';
import { BankOffersService } from './bank-offers.service.js';
import { BankerContactsController } from './banker-contacts.controller.js';
import { BankerContactsService } from './banker-contacts.service.js';
import { MortgageCasesController } from './mortgage-cases.controller.js';
import { MortgageCasesService } from './mortgage-cases.service.js';

/** The mortgage-broker vertical's own CRM resources, beside `CrmModule`'s shared ones. */
@Module({
  controllers: [MortgageCasesController, BankOffersController, BankerContactsController],
  providers: [MortgageCasesService, BankOffersService, BankerContactsService],
})
export class MortgageCrmModule {}
