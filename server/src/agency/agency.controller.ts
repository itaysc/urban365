import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { AgencyService } from './agency.service.js';

@Controller('agencies')
export class AgencyController {
  constructor(private readonly agencies: AgencyService) {}

  /**
   * Public, so the signup form can offer "is this you?" against the agencies already
   * scraped. Returns **unclaimed agencies only**, and no contact details — it must not
   * become a way to harvest the scraped set.
   */
  @Public()
  @Get('lookup')
  lookup(@Query('q') q?: string) {
    return this.agencies.lookupUnclaimed(q ?? '');
  }
}
