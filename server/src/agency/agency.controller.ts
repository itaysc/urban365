import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

  /**
   * An office's private page. The token is the whole authorisation, and it is the only
   * way to reach these drafts, so the answer is never cached or indexed.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('preview/:token')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  preview(@Param('token') token: string) {
    return this.agencies.preview(token);
  }
}
