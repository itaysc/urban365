import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator.js';
import { AgencyEnquiryDto } from './dto/agency-enquiry.dto.js';
import { PublicAgenciesService } from './public-agencies.service.js';

/** The public directory and each agency's own page. No session. */
@Public()
@Controller('agencies')
export class PublicAgenciesController {
  constructor(private readonly agencies: PublicAgenciesService) {}

  @Get()
  directory() {
    return this.agencies.directory();
  }

  /**
   * Declared before `:key` would not matter here — Nest matches the static `lookup`
   * route on the other controller — but the enquiry path has to stay more specific
   * than a bare id, which it is by having a second segment.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':key/enquiries')
  enquire(@Param('key') key: string, @Body() dto: AgencyEnquiryDto) {
    return this.agencies.enquire(key, dto);
  }

  @Get(':key')
  page(@Param('key') key: string) {
    return this.agencies.page(key);
  }
}
